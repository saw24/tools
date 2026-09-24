<?php
/**
 * API Module: Export Indicators with Dependencies
 * Exporte des indicateurs DHIS2 avec toutes les dépendances nécessaires à leur
 * réimport sur une autre instance : IndicatorType, éléments référencés dans les
 * formules numérateur/dénominateur (#{...}, C{...}, R{...}, OUG{...}, D{...},
 * A{...}, I{...}), et toute la chaîne CategoryCombo -> Categories ->
 * CategoryOptions -> CategoryOptionCombos qui en découle.
 *
 * Différence de performance avec les autres modules d'export du projet :
 * toutes les lectures DHIS2 sont batchées via filter=id:in:[...] (par paquets
 * de 100 UID) au lieu d'un appel HTTP par objet, ce qui réduit le nombre de
 * requêtes d'un facteur proportionnel au nombre d'objets exportés.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
set_time_limit(120);

class IndicatorExportAPI
{
    private $dhis2Url;
    private $dhis2Auth;
    private $warnings = [];

    const CHUNK_SIZE = 100;
    const MAX_INDICATOR_DEPTH = 10;
    const MAX_NESTED_INDICATORS = 200;

    public function handleRequest()
    {
        try {
            $this->loadDHIS2Config();
            $input = $this->getRequestData();

            $rawUids = preg_split('/[,;\s]+/', trim($input['indicatorUids'] ?? ''));
            $rawUids = array_values(array_unique(array_filter(array_map('trim', $rawUids), function ($uid) {
                return strlen($uid) === 11;
            })));

            if (empty($rawUids)) {
                throw new Exception('Aucun UID valide trouvé. Les UID DHIS2 doivent avoir 11 caractères.');
            }

            $includeGroups = !empty($input['includeGroups']);
            $includeGroupSets = !empty($input['includeGroupSets']);
            $includeLegendSets = array_key_exists('includeLegendSets', $input) ? !empty($input['includeLegendSets']) : true;

            error_log('📦 Export de ' . count($rawUids) . ' Indicateur(s): ' . implode(', ', $rawUids));

            // 1. Résolution récursive des indicateurs (gère les indicateurs imbriqués I{...})
            $indicatorFields = 'id,name,shortName,description,annualized,decimals,url,'
                . 'indicatorType[id],numerator,numeratorDescription,denominator,denominatorDescription,'
                . 'legendSets[id],indicatorGroups[id]';

            $indicators = [];
            $visited = [];
            $queue = $rawUids;
            $depth = 0;

            while (!empty($queue) && $depth < self::MAX_INDICATOR_DEPTH) {
                $toFetch = array_values(array_diff(array_unique($queue), array_keys($visited)));
                $queue = [];
                if (empty($toFetch)) {
                    break;
                }

                $fetched = $this->bulkFetch('indicators', $toFetch, $indicatorFields, 'indicators');
                foreach ($toFetch as $uid) {
                    $visited[$uid] = true;
                }

                foreach ($fetched as $ind) {
                    $indicators[$ind['id']] = $ind;

                    if (count($indicators) > self::MAX_NESTED_INDICATORS) {
                        $this->warn('Limite de ' . self::MAX_NESTED_INDICATORS . ' indicateurs imbriqués atteinte, résolution I{...} arrêtée.');
                        continue;
                    }

                    $tokens = $this->parseExpressionTokens(($ind['numerator'] ?? '') . ' ' . ($ind['denominator'] ?? ''));
                    foreach ($tokens['indicators'] as $nestedId) {
                        if (!isset($visited[$nestedId])) {
                            $queue[] = $nestedId;
                        }
                    }
                }
                $depth++;
            }

            if (empty($indicators)) {
                throw new Exception('Aucun indicateur valide trouvé.');
            }

            $indicatorIds = array_keys($indicators);

            // 2. Parser toutes les formules pour extraire les dépendances
            $allTokens = [
                'dataElements' => [],      // uid => true
                'categoryOptionCombos' => [], // uid => true (opérandes explicites #{de.coc[.aoc]})
                'constants' => [],
                'dataSets' => [],          // via R{dataSet.METRIC}
                'orgUnitGroups' => [],     // via OUG{uid}
                'programDataElements' => [], // via D{program.de} -> [program, de]
                'programAttributes' => [],   // via A{program.attr} -> [program, attr]
            ];

            foreach ($indicators as $ind) {
                $tokens = $this->parseExpressionTokens(($ind['numerator'] ?? '') . ' ' . ($ind['denominator'] ?? ''));
                $allTokens['dataElements'] += $tokens['dataElements'];
                $allTokens['categoryOptionCombos'] += $tokens['categoryOptionCombos'];
                $allTokens['constants'] += $tokens['constants'];
                $allTokens['dataSets'] += $tokens['dataSets'];
                $allTokens['orgUnitGroups'] += $tokens['orgUnitGroups'];
                $allTokens['programDataElements'] += $tokens['programDataElements'];
                $allTokens['programAttributes'] += $tokens['programAttributes'];

                foreach ($tokens['programDataElements'] as $key => $pair) {
                    $this->warn("Indicateur \"{$ind['name']}\" référence D{{$pair['program']}.{$pair['de']}} : le programme {$pair['program']} doit déjà exister sur l'instance cible (non exporté par ce module).");
                }
                foreach ($tokens['programAttributes'] as $key => $pair) {
                    $this->warn("Indicateur \"{$ind['name']}\" référence A{{$pair['program']}.{$pair['attr']}} : le programme {$pair['program']} doit déjà exister sur l'instance cible (non exporté par ce module).");
                }
                if (!empty($tokens['variables'])) {
                    $this->warn("Indicateur \"{$ind['name']}\" contient des variables V{...} (généralement propres aux indicateurs de programme) : " . implode(', ', array_keys($tokens['variables'])));
                }
            }

            // Les data elements référencés par D{program.de} sont de vrais objets DataElement
            foreach ($allTokens['programDataElements'] as $pair) {
                $allTokens['dataElements'][$pair['de']] = true;
            }

            // 3. IndicatorType
            $typeIds = array_values(array_unique(array_filter(array_map(function ($i) {
                return $i['indicatorType']['id'] ?? null;
            }, $indicators))));
            $indicatorTypes = $this->bulkFetch('indicatorTypes', $typeIds, 'id,name,factor,number', 'indicatorTypes');

            // 4. DataElements référencés dans les formules
            $deIds = array_keys($allTokens['dataElements']);
            $dataElements = $this->bulkFetch(
                'dataElements',
                $deIds,
                'id,name,shortName,description,aggregationType,domainType,valueType,zeroIsSignificant,categoryCombo[id]',
                'dataElements'
            );

            // 5. Chaîne CategoryCombo (via DataElements + COC explicites des opérandes)
            $explicitCocIds = array_keys($allTokens['categoryOptionCombos']);
            $explicitCocs = $this->bulkFetch(
                'categoryOptionCombos',
                $explicitCocIds,
                'id,categoryCombo[id],categoryOptions[id]',
                'categoryOptionCombos'
            );

            $comboIds = [];
            foreach ($dataElements as $de) {
                if (!empty($de['categoryCombo']['id'])) {
                    $comboIds[$de['categoryCombo']['id']] = true;
                }
            }
            foreach ($explicitCocs as $coc) {
                if (!empty($coc['categoryCombo']['id'])) {
                    $comboIds[$coc['categoryCombo']['id']] = true;
                }
            }

            // 6. DataSets référencés par les taux de complétude R{dataSet.METRIC}
            $dataSetIds = array_keys($allTokens['dataSets']);
            $dataSets = $this->bulkFetch(
                'dataSets',
                $dataSetIds,
                'id,name,shortName,periodType,categoryCombo[id]',
                'dataSets'
            );
            foreach ($dataSets as $ds) {
                if (!empty($ds['categoryCombo']['id'])) {
                    $comboIds[$ds['categoryCombo']['id']] = true;
                }
            }

            $comboChain = $this->resolveCategoryComboChain(array_keys($comboIds), $explicitCocs);

            // 7. Constants
            $constantIds = array_keys($allTokens['constants']);
            $constants = $this->bulkFetch('constants', $constantIds, 'id,name,shortName,value', 'constants');

            // 8. OrgUnitGroups
            $ougIds = array_keys($allTokens['orgUnitGroups']);
            $orgUnitGroups = $this->bulkFetch('organisationUnitGroups', $ougIds, 'id,name,shortName,code', 'organisationUnitGroups');

            // 9. TrackedEntityAttributes (via A{program.attr})
            $teaIds = array_values(array_unique(array_map(function ($p) {
                return $p['attr']; }, $allTokens['programAttributes'])));
            $trackedEntityAttributes = $this->bulkFetch('trackedEntityAttributes', $teaIds, 'id,name,shortName,valueType', 'trackedEntityAttributes');

            // 10. LegendSets
            $legendSets = [];
            if ($includeLegendSets) {
                $lsIds = [];
                foreach ($indicators as $ind) {
                    foreach ($ind['legendSets'] ?? [] as $ls) {
                        $lsIds[$ls['id']] = true;
                    }
                }
                $legendSets = $this->bulkFetch(
                    'legendSets',
                    array_keys($lsIds),
                    'id,name,legends[id,name,startValue,endValue,color]',
                    'legendSets'
                );
            }

            // 11. IndicatorGroups / IndicatorGroupSets (optionnel)
            $indicatorGroups = [];
            $indicatorGroupSets = [];
            if ($includeGroups) {
                $igIds = [];
                foreach ($indicators as $ind) {
                    foreach ($ind['indicatorGroups'] ?? [] as $ig) {
                        $igIds[$ig['id']] = true;
                    }
                }
                $rawGroups = $this->bulkFetch('indicatorGroups', array_keys($igIds), 'id,name,shortName,indicators[id]', 'indicatorGroups');
                foreach ($rawGroups as $g) {
                    $g['indicators'] = array_values(array_filter($g['indicators'] ?? [], function ($ref) use ($indicatorIds) {
                        return in_array($ref['id'], $indicatorIds, true);
                    }));
                    $indicatorGroups[$g['id']] = $g;
                }

                if ($includeGroupSets && !empty($indicatorGroups)) {
                    $groupIdSet = array_flip(array_keys($indicatorGroups));
                    $allGroupSets = $this->fetchAll('indicatorGroupSets', 'id,name,shortName,compulsory,indicatorGroups[id]');
                    foreach ($allGroupSets as $gs) {
                        $memberIds = array_map(function ($g) {
                            return $g['id']; }, $gs['indicatorGroups'] ?? []);
                        $relevant = array_values(array_intersect($memberIds, array_keys($groupIdSet)));
                        if (!empty($relevant)) {
                            $gs['indicatorGroups'] = array_map(function ($id) {
                                return ['id' => $id]; }, $relevant);
                            $indicatorGroupSets[$gs['id']] = $gs;
                        }
                    }
                }
            }

            // 12. CategoryOptionGroups / GroupSets (optionnel, sur les CategoryOptions résolues)
            $categoryOptionGroups = [];
            $categoryOptionGroupSets = [];
            if ($includeGroups && !empty($comboChain['categoryOptions'])) {
                $optionIdSet = array_flip(array_keys($comboChain['categoryOptions']));
                $allCogs = $this->fetchAll('categoryOptionGroups', 'id,name,shortName,categoryOptions[id]');
                foreach ($allCogs as $g) {
                    $hasRelevant = false;
                    foreach ($g['categoryOptions'] ?? [] as $co) {
                        if (isset($optionIdSet[$co['id']])) {
                            $hasRelevant = true;
                            break;
                        }
                    }
                    if ($hasRelevant) {
                        $categoryOptionGroups[$g['id']] = $g;
                    }
                }

                if ($includeGroupSets && !empty($categoryOptionGroups)) {
                    $groupIdSet = array_flip(array_keys($categoryOptionGroups));
                    $allCogSets = $this->fetchAll('categoryOptionGroupSets', 'id,name,shortName,categoryOptionGroups[id]');
                    foreach ($allCogSets as $gs) {
                        $hasRelevant = false;
                        foreach ($gs['categoryOptionGroups'] ?? [] as $g) {
                            if (isset($groupIdSet[$g['id']])) {
                                $hasRelevant = true;
                                break;
                            }
                        }
                        if ($hasRelevant) {
                            $categoryOptionGroupSets[$gs['id']] = $gs;
                        }
                    }
                }
            }

            // 13. Construction du package d'export
            $exportPackage = [
                'indicators' => array_values(array_map([$this, 'shapeIndicator'], $indicators)),
                'indicatorTypes' => array_values($indicatorTypes),
                'dataElements' => array_values(array_map([$this, 'shapeDataElement'], $dataElements)),
                'categoryCombos' => array_values($comboChain['categoryCombos']),
                'categories' => array_values($comboChain['categories']),
                'categoryOptions' => array_values($comboChain['categoryOptions']),
                'categoryOptionCombos' => array_values($comboChain['categoryOptionCombos']),
                'constants' => array_values($constants),
                'dataSets' => array_values(array_map(function ($ds) {
                    return ['id' => $ds['id'], 'name' => $ds['name'], 'shortName' => $ds['shortName'] ?? substr($ds['name'], 0, 50), 'periodType' => $ds['periodType'], 'categoryCombo' => ['id' => $ds['categoryCombo']['id'] ?? null]];
                }, $dataSets)),
                'organisationUnitGroups' => array_values($orgUnitGroups),
                'trackedEntityAttributes' => array_values($trackedEntityAttributes),
                'legendSets' => array_values($legendSets),
                'indicatorGroups' => array_values($indicatorGroups),
                'indicatorGroupSets' => array_values($indicatorGroupSets),
                'categoryOptionGroups' => array_values($categoryOptionGroups),
                'categoryOptionGroupSets' => array_values($categoryOptionGroupSets),
            ];

            $summary = [];
            foreach ($exportPackage as $key => $arr) {
                $summary[$key] = count($arr);
            }

            error_log('✅ Export multi-Indicateur terminé ! ' . json_encode($summary));

            $this->sendResponse(true, "Export de {$summary['indicators']} Indicateur(s) réussi", [
                'indicatorCount' => $summary['indicators'],
                'data' => $exportPackage,
                'summary' => $summary,
                'warnings' => array_values(array_unique($this->warnings)),
            ]);

        } catch (Exception $e) {
            error_log('❌ Erreur serveur: ' . $e->getMessage());
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    /**
     * Résout Categories -> CategoryOptions -> CategoryOptionCombos pour un
     * ensemble de CategoryCombo, en réutilisant les COC déjà récupérées
     * explicitement (opérandes #{de.coc}) pour éviter les doublons de requêtes.
     */
    private function resolveCategoryComboChain($comboIds, $seedCocs)
    {
        $categoryCombos = [];
        $categories = [];
        $categoryOptions = [];
        $categoryOptionCombos = [];

        foreach ($seedCocs as $coc) {
            $categoryOptionCombos[$coc['id']] = $coc;
        }

        if (empty($comboIds)) {
            return compact('categoryCombos', 'categories', 'categoryOptions', 'categoryOptionCombos');
        }

        $combos = $this->bulkFetch(
            'categoryCombos',
            $comboIds,
            'id,name,shortName,dataDimensionType,categories[id],categoryOptionCombos[id]',
            'categoryCombos'
        );

        $categoryIds = [];
        $cocIds = [];
        foreach ($combos as $combo) {
            $categoryCombos[$combo['id']] = $combo;
            foreach ($combo['categories'] ?? [] as $c) {
                $categoryIds[$c['id']] = true;
            }
            foreach ($combo['categoryOptionCombos'] ?? [] as $coc) {
                $cocIds[$coc['id']] = true;
            }
        }

        $cats = $this->bulkFetch('categories', array_keys($categoryIds), 'id,name,shortName,dataDimensionType,categoryOptions[id]', 'categories');
        $optionIds = [];
        foreach ($cats as $cat) {
            $categories[$cat['id']] = $cat;
            foreach ($cat['categoryOptions'] ?? [] as $co) {
                $optionIds[$co['id']] = true;
            }
        }

        $missingCocIds = array_values(array_diff(array_keys($cocIds), array_keys($categoryOptionCombos)));
        $moreCocs = $this->bulkFetch('categoryOptionCombos', $missingCocIds, 'id,categoryCombo[id],categoryOptions[id]', 'categoryOptionCombos');
        foreach ($moreCocs as $coc) {
            $categoryOptionCombos[$coc['id']] = $coc;
        }
        foreach ($categoryOptionCombos as $coc) {
            foreach ($coc['categoryOptions'] ?? [] as $co) {
                $optionIds[$co['id']] = true;
            }
        }

        $opts = $this->bulkFetch('categoryOptions', array_keys($optionIds), 'id,name,shortName', 'categoryOptions');
        foreach ($opts as $opt) {
            $categoryOptions[$opt['id']] = [
                'id' => $opt['id'],
                'name' => $opt['name'] ?? $opt['id'],
                'shortName' => $opt['shortName'] ?? substr($opt['name'] ?? $opt['id'], 0, 50),
                'aggregationType' => 'SUM',
            ];
        }

        $shapedCombos = [];
        foreach ($categoryCombos as $combo) {
            $shapedCombos[$combo['id']] = [
                'id' => $combo['id'],
                'name' => $combo['name'],
                'shortName' => $combo['shortName'] ?? substr($combo['name'] ?? $combo['id'], 0, 50),
                'dataDimensionType' => $combo['dataDimensionType'] ?? 'DISAGGREGATION',
                'categories' => array_map(function ($c) {
                    return ['id' => $c['id']]; }, $combo['categories'] ?? []),
            ];
        }

        $shapedCats = [];
        foreach ($categories as $cat) {
            $shapedCats[$cat['id']] = [
                'id' => $cat['id'],
                'name' => $cat['name'],
                'shortName' => $cat['shortName'] ?? substr($cat['name'] ?? $cat['id'], 0, 50),
                'dataDimensionType' => $cat['dataDimensionType'] ?? 'DISAGGREGATION',
                'categoryOptions' => array_map(function ($co) {
                    return ['id' => $co['id']]; }, $cat['categoryOptions'] ?? []),
            ];
        }

        $shapedCocs = [];
        foreach ($categoryOptionCombos as $coc) {
            if (empty($coc['categoryCombo']['id'])) {
                continue;
            }
            $shapedCocs[$coc['id']] = [
                'id' => $coc['id'],
                'aggregationType' => 'SUM',
                'dimensionItemType' => 'CATEGORY_OPTION',
                'categoryCombo' => ['id' => $coc['categoryCombo']['id']],
                'categoryOptions' => array_map(function ($co) {
                    return ['id' => $co['id']]; }, $coc['categoryOptions'] ?? []),
            ];
        }

        return [
            'categoryCombos' => $shapedCombos,
            'categories' => $shapedCats,
            'categoryOptions' => $categoryOptions,
            'categoryOptionCombos' => $shapedCocs,
        ];
    }

    private function shapeIndicator($ind)
    {
        $out = [
            'id' => $ind['id'],
            'name' => $ind['name'],
            'shortName' => $ind['shortName'] ?? substr($ind['name'] ?? $ind['id'], 0, 50),
            'description' => $ind['description'] ?? '',
            'annualized' => $ind['annualized'] ?? false,
            'indicatorType' => ['id' => $ind['indicatorType']['id'] ?? null],
            'numerator' => $ind['numerator'] ?? '',
            'numeratorDescription' => $ind['numeratorDescription'] ?? '',
            'denominator' => $ind['denominator'] ?? '',
            'denominatorDescription' => $ind['denominatorDescription'] ?? '',
        ];
        if (isset($ind['decimals'])) {
            $out['decimals'] = $ind['decimals'];
        }
        if (!empty($ind['url'])) {
            $out['url'] = $ind['url'];
        }
        if (!empty($ind['legendSets'])) {
            $out['legendSets'] = array_map(function ($ls) {
                return ['id' => $ls['id']]; }, $ind['legendSets']);
        }
        return $out;
    }

    private function shapeDataElement($de)
    {
        return [
            'id' => $de['id'],
            'name' => $de['name'],
            'shortName' => $de['shortName'] ?? substr($de['name'] ?? $de['id'], 0, 50),
            'description' => $de['description'] ?? '',
            'aggregationType' => $de['aggregationType'] ?? 'SUM',
            'domainType' => $de['domainType'] ?? 'AGGREGATE',
            'valueType' => $de['valueType'] ?? 'TEXT',
            'zeroIsSignificant' => $de['zeroIsSignificant'] ?? false,
            'categoryCombo' => ['id' => $de['categoryCombo']['id'] ?? null],
        ];
    }

    /**
     * Extrait tous les tokens de dépendance d'une expression DHIS2
     * (numérateur ou dénominateur d'indicateur).
     */
    private function parseExpressionTokens($expression)
    {
        $result = [
            'dataElements' => [],
            'categoryOptionCombos' => [],
            'constants' => [],
            'dataSets' => [],
            'orgUnitGroups' => [],
            'indicators' => [],
            'programDataElements' => [],
            'programAttributes' => [],
            'variables' => [],
        ];

        if (preg_match_all('/#\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $parts = explode('.', $token);
                if (!empty($parts[0])) {
                    $result['dataElements'][$parts[0]] = true;
                }
                if (!empty($parts[1])) {
                    $result['categoryOptionCombos'][$parts[1]] = true;
                }
                if (!empty($parts[2])) {
                    $result['categoryOptionCombos'][$parts[2]] = true;
                }
            }
        }

        if (preg_match_all('/C\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $result['constants'][$token] = true;
            }
        }

        if (preg_match_all('/R\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $parts = explode('.', $token);
                if (!empty($parts[0])) {
                    $result['dataSets'][$parts[0]] = true;
                }
            }
        }

        if (preg_match_all('/OUG\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $result['orgUnitGroups'][$token] = true;
            }
        }

        if (preg_match_all('/I\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $result['indicators'][$token] = true;
            }
        }

        if (preg_match_all('/D\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $parts = explode('.', $token);
                if (count($parts) >= 2) {
                    $key = $token;
                    $result['programDataElements'][$key] = ['program' => $parts[0], 'de' => $parts[1]];
                }
            }
        }

        if (preg_match_all('/A\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $parts = explode('.', $token);
                if (count($parts) >= 2) {
                    $key = $token;
                    $result['programAttributes'][$key] = ['program' => $parts[0], 'attr' => $parts[1]];
                }
            }
        }

        if (preg_match_all('/V\{([^}]+)\}/', $expression, $m)) {
            foreach ($m[1] as $token) {
                $result['variables'][$token] = true;
            }
        }

        return $result;
    }

    /**
     * Récupère plusieurs objets DHIS2 par UID en batchant les requêtes
     * (filter=id:in:[...]) par paquets de CHUNK_SIZE au lieu d'un appel par UID.
     * Retourne un tableau indexé par id.
     */
    private function bulkFetch($resource, array $ids, $fields, $collectionKey)
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if (empty($ids)) {
            return [];
        }

        $out = [];
        $chunks = array_chunk($ids, self::CHUNK_SIZE);

        foreach ($chunks as $chunk) {
            $filter = 'id:in:[' . implode(',', $chunk) . ']';
            $endpoint = "/api/{$resource}?fields=" . urlencode($fields)
                . '&filter=' . urlencode($filter)
                . '&paging=false';

            try {
                $resp = $this->makeRequest($endpoint);
                foreach ($resp[$collectionKey] ?? [] as $item) {
                    $out[$item['id']] = $item;
                }
            } catch (Exception $e) {
                $this->warn("Erreur lors de la récupération de {$resource}: " . $e->getMessage());
            }
        }

        $missing = array_diff($ids, array_keys($out));
        foreach ($missing as $missingId) {
            $this->warn("{$resource} introuvable sur l'instance source: {$missingId}");
        }

        return $out;
    }

    /**
     * Récupère une collection complète (paging=false), utilisé uniquement pour
     * les objets non filtrables efficacement par appartenance (Groups/GroupSets).
     */
    private function fetchAll($resource, $fields)
    {
        $endpoint = "/api/{$resource}?fields=" . urlencode($fields) . '&paging=false';
        $resp = $this->makeRequest($endpoint);
        return $resp[$resource] ?? [];
    }

    private function warn($message)
    {
        $this->warnings[] = $message;
        error_log('⚠️ ' . $message);
    }

    private function loadDHIS2Config()
    {
        $input = $this->getRequestData();

        if (empty($input['dhis2_url']) || empty($input['dhis2_auth'])) {
            throw new Exception('Configuration DHIS2 manquante');
        }

        $this->dhis2Url = rtrim($input['dhis2_url'], '/');
        $this->dhis2Auth = $input['dhis2_auth'];
    }

    private function getRequestData()
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }

        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

        if (strpos($contentType, 'application/json') !== false) {
            $rawInput = file_get_contents('php://input');
            $data = json_decode($rawInput, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('JSON invalide: ' . json_last_error_msg());
            }

            $cached = $data;
            return $data;
        }

        $cached = $_POST;
        return $_POST;
    }

    private function makeRequest($endpoint, $method = 'GET', $body = null)
    {
        $fullUrl = $this->dhis2Url . $endpoint;

        $ch = curl_init();

        $curlOptions = [
            CURLOPT_URL => $fullUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_UNRESTRICTED_AUTH => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: ' . $this->dhis2Auth,
            ],
        ];

        if ($method === 'POST' && $body) {
            $curlOptions[CURLOPT_POST] = true;
            $curlOptions[CURLOPT_POSTFIELDS] = json_encode($body);
        }

        curl_setopt_array($ch, $curlOptions);

        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new Exception("Erreur cURL: $error");
        }

        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decodedResponse = json_decode($response, true);

        if ($httpCode >= 400) {
            $errorMessage = $this->extractErrorMessage($decodedResponse, $httpCode);
            throw new Exception($errorMessage);
        }

        return $decodedResponse;
    }

    private function extractErrorMessage($response, $httpCode)
    {
        if (is_array($response)) {
            if (isset($response['message'])) {
                return $response['message'];
            }
            if (isset($response['error'])) {
                return is_string($response['error']) ? $response['error'] : json_encode($response['error']);
            }
        }

        $defaultMessages = [
            400 => 'Requête invalide',
            401 => 'Non autorisé - Vérifiez vos identifiants',
            403 => 'Accès interdit',
            404 => 'Ressource non trouvée',
            500 => 'Erreur serveur DHIS2',
        ];

        return $defaultMessages[$httpCode] ?? "Erreur HTTP $httpCode";
    }

    private function sendResponse($success, $message, $data = null, $httpCode = 200)
    {
        http_response_code($httpCode);

        $response = [
            'success' => $success,
            'message' => $message,
            'timestamp' => date('Y-m-d H:i:s'),
        ];

        if ($data !== null) {
            $response = array_merge($response, $data);
        }

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }
}

// Point d'entrée
try {
    $api = new IndicatorExportAPI();
    $api->handleRequest();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s'),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
