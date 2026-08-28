<?php
/**
 * API Module: Export DataSets (forms) with dependencies
 * Exporte un ou plusieurs formulaires DHIS2 avec leurs éléments de données
 * et combinaisons de catégories nécessaires à une migration.
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

class FormExportAPI
{
    private $dhis2Url;
    private $dhis2Auth;
    private $requestId = 'manual';
    private $logFile = null;

    public function handleRequest()
    {
        try {
            $this->loadDHIS2Config();
            $input = $this->getRequestData();
            $this->initRequestLog($input['requestId'] ?? null);

            $dataSetUids = $input['dataSetUids'] ?? '';
            $includeGroups = $input['includeGroups'] ?? true;
            $includeGroupSets = $input['includeGroupSets'] ?? true;
            $includeSections = $input['includeSections'] ?? true;
            $includeOrgUnits = $input['includeOrgUnits'] ?? false;

            $this->logStep('Démarrage export formulaire');
            $this->logStep('Options: sections=' . ($includeSections ? 'oui' : 'non') .
                ', orgUnits=' . ($includeOrgUnits ? 'oui' : 'non') .
                ', groups=' . ($includeGroups ? 'oui' : 'non') .
                ', groupSets=' . ($includeGroupSets ? 'oui' : 'non'));

            if (empty($dataSetUids)) {
                throw new Exception('dataSetUids est requis');
            }

            $uids = $this->parseUids($dataSetUids);
            if (empty($uids)) {
                throw new Exception('Aucun UID valide trouvé. Les UID DHIS2 doivent avoir 11 caractères.');
            }
            $this->logStep(count($uids) . ' formulaire(s) sélectionné(s): ' . implode(', ', $uids));

            $dataSets = [];
            $sections = [];
            $dataElementIds = [];
            $categoryComboIds = [];

            foreach ($uids as $uid) {
                try {
                    $this->logStep("Lecture formulaire {$uid}");
                    $dataSetExport = $this->exportDataSet($uid, $includeSections, $includeOrgUnits);
                    $dataSets[] = $dataSetExport['dataSet'];
                    $sections = array_merge($sections, $dataSetExport['sections']);
                    $this->logStep("Formulaire {$uid}: " . count($dataSetExport['dataElementIds']) .
                        ' élément(s), ' . count($dataSetExport['sections']) . ' section(s)');

                    foreach ($dataSetExport['dataElementIds'] as $deId) {
                        $dataElementIds[$deId] = true;
                    }

                    foreach ($dataSetExport['categoryComboIds'] as $comboId) {
                        $categoryComboIds[$comboId] = true;
                    }
                } catch (Exception $e) {
                    $this->logStep("Erreur formulaire {$uid}: " . $e->getMessage());
                    error_log("Erreur DataSet {$uid}: " . $e->getMessage());
                    continue;
                }
            }

            if (empty($dataSets)) {
                throw new Exception('Aucun formulaire valide trouvé.');
            }

            $dataElements = [];
            $deIds = array_keys($dataElementIds);
            $this->logStep('Lecture de ' . count($deIds) . ' élément(s) de données unique(s)');
            foreach ($deIds as $index => $deId) {
                $this->logStep('Lecture élément de données ' . ($index + 1) . '/' . count($deIds) . ": {$deId}");
                $dataElement = $this->exportDataElement($deId);
                $dataElements[] = $dataElement;
                if (!empty($dataElement['categoryCombo']['id'])) {
                    $categoryComboIds[$dataElement['categoryCombo']['id']] = true;
                }
            }

            $comboExports = [];
            $comboIds = array_keys($categoryComboIds);
            $this->logStep('Lecture de ' . count($comboIds) . ' combinaison(s) de catégories unique(s)');
            foreach ($comboIds as $index => $comboId) {
                $this->logStep('Lecture CategoryCombo ' . ($index + 1) . '/' . count($comboIds) . ": {$comboId}");
                $comboExports[] = $this->exportCategoryCombo($comboId, $includeGroups, $includeGroupSets);
            }

            $this->logStep('Fusion et déduplication des métadonnées');
            $mergedCombos = $this->mergeComboExports($comboExports, $includeGroups, $includeGroupSets);

            $exportPackage = [
                'dataSets' => $this->uniqueById($dataSets),
                'sections' => $includeSections ? $this->uniqueById($sections) : [],
                'dataElements' => $this->uniqueById($dataElements),
                'categoryCombos' => $this->uniqueById($mergedCombos['categoryCombos']),
                'categories' => $this->uniqueById($mergedCombos['categories']),
                'categoryOptions' => $this->uniqueById($mergedCombos['categoryOptions']),
                'categoryOptionCombos' => $this->uniqueById($mergedCombos['categoryOptionCombos']),
                'categoryOptionGroups' => $includeGroups ? $this->uniqueById($mergedCombos['categoryOptionGroups']) : [],
                'categoryOptionGroupSets' => $includeGroupSets ? $this->uniqueById($mergedCombos['categoryOptionGroupSets']) : []
            ];

            $summary = [
                'dataSets' => count($exportPackage['dataSets']),
                'sections' => count($exportPackage['sections']),
                'dataElements' => count($exportPackage['dataElements']),
                'categoryCombos' => count($exportPackage['categoryCombos']),
                'categories' => count($exportPackage['categories']),
                'categoryOptions' => count($exportPackage['categoryOptions']),
                'categoryOptionCombos' => count($exportPackage['categoryOptionCombos']),
                'categoryOptionGroups' => count($exportPackage['categoryOptionGroups']),
                'categoryOptionGroupSets' => count($exportPackage['categoryOptionGroupSets'])
            ];
            $this->logStep('Résumé: ' . json_encode($summary, JSON_UNESCAPED_UNICODE));
            $this->logStep('Export terminé avec succès');

            $this->sendResponse(true, "Export de {$summary['dataSets']} formulaire(s) réussi", [
                'dataSetCount' => $summary['dataSets'],
                'data' => $exportPackage,
                'summary' => $summary,
                'requestId' => $this->requestId
            ]);
        } catch (Exception $e) {
            $this->logStep('ERREUR: ' . $e->getMessage());
            error_log('Erreur export formulaire: ' . $e->getMessage());
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    private function exportDataSet($dataSetId, $includeSections, $includeOrgUnits)
    {
        $fields = 'id,name,shortName,code,description,periodType,categoryCombo[id],dataSetElements[dataElement[id]]';

        if ($includeSections) {
            $fields .= ',sections[id,name,sortOrder,dataElements[id],greyedFields[dataElement[id],categoryOptionCombo[id]]]';
        }

        if ($includeOrgUnits) {
            $fields .= ',organisationUnits[id]';
        }

        $this->logStep("Requête DataSet {$dataSetId}");
        $resp = $this->makeRequest("/api/dataSets/{$dataSetId}?fields=" . urlencode($fields));

        $dataSetElements = [];
        $dataElementIds = [];
        foreach ($resp['dataSetElements'] ?? [] as $dse) {
            if (!empty($dse['dataElement']['id'])) {
                $deId = $dse['dataElement']['id'];
                $dataElementIds[] = $deId;
                $dataSetElements[] = ['dataElement' => ['id' => $deId]];
            }
        }

        $categoryComboIds = [];
        if (!empty($resp['categoryCombo']['id'])) {
            $categoryComboIds[] = $resp['categoryCombo']['id'];
        }

        $dataSet = [
            'id' => $resp['id'],
            'name' => $resp['name'] ?? $resp['id'],
            'shortName' => $resp['shortName'] ?? substr($resp['name'] ?? $resp['id'], 0, 50),
            'periodType' => $resp['periodType'] ?? 'Monthly',
            'dataSetElements' => $dataSetElements
        ];

        $this->addOptional($dataSet, 'code', $resp);
        $this->addOptional($dataSet, 'description', $resp);
        if (!empty($resp['categoryCombo']['id'])) {
            $dataSet['categoryCombo'] = ['id' => $resp['categoryCombo']['id']];
        }
        if ($includeOrgUnits && !empty($resp['organisationUnits'])) {
            $dataSet['organisationUnits'] = $this->refs($resp['organisationUnits']);
        }

        $sections = [];
        if ($includeSections) {
            foreach ($resp['sections'] ?? [] as $section) {
                $sectionExport = [
                    'id' => $section['id'],
                    'name' => $section['name'] ?? $section['id'],
                    'sortOrder' => $section['sortOrder'] ?? 0,
                    'dataSet' => ['id' => $resp['id']],
                    'dataElements' => $this->refs($section['dataElements'] ?? [])
                ];

                if (!empty($section['greyedFields'])) {
                    $sectionExport['greyedFields'] = $this->greyedFieldRefs($section['greyedFields']);
                }

                $sections[] = $sectionExport;
            }
        }

        return [
            'dataSet' => $dataSet,
            'sections' => $sections,
            'dataElementIds' => array_values(array_unique($dataElementIds)),
            'categoryComboIds' => array_values(array_unique($categoryComboIds))
        ];
    }

    private function exportDataElement($dataElementId)
    {
        $fields = 'id,name,shortName,code,description,aggregationType,domainType,valueType,zeroIsSignificant,categoryCombo[id]';
        $this->logStep("Requête DataElement {$dataElementId}");
        $resp = $this->makeRequest("/api/dataElements/{$dataElementId}?fields=" . urlencode($fields));

        $dataElement = [
            'id' => $resp['id'],
            'name' => $resp['name'] ?? $resp['id'],
            'shortName' => $resp['shortName'] ?? substr($resp['name'] ?? $resp['id'], 0, 50),
            'aggregationType' => $resp['aggregationType'] ?? 'SUM',
            'domainType' => $resp['domainType'] ?? 'AGGREGATE',
            'valueType' => $resp['valueType'] ?? 'TEXT',
            'zeroIsSignificant' => $resp['zeroIsSignificant'] ?? false
        ];

        $this->addOptional($dataElement, 'code', $resp);
        $this->addOptional($dataElement, 'description', $resp);
        if (!empty($resp['categoryCombo']['id'])) {
            $dataElement['categoryCombo'] = ['id' => $resp['categoryCombo']['id']];
        }
        return $dataElement;
    }

    private function exportCategoryCombo($categoryComboId, $includeGroups, $includeGroupSets)
    {
        $comboFields = 'id,name,shortName,code,dataDimensionType,categories[id],categoryOptionCombos[id]';
        $this->logStep("Requête CategoryCombo {$categoryComboId}");
        $comboResp = $this->makeRequest("/api/categoryCombos/{$categoryComboId}?fields=" . urlencode($comboFields));

        $categories = [];
        $optionIdSet = [];
        foreach ($comboResp['categories'] ?? [] as $cat) {
            $catFields = 'id,name,shortName,code,dataDimensionType,categoryOptions[id]';
            $this->logStep("Requête Category {$cat['id']}");
            $catResp = $this->makeRequest("/api/categories/{$cat['id']}?fields=" . urlencode($catFields));

            $category = [
                'id' => $catResp['id'],
                'name' => $catResp['name'] ?? $catResp['id'],
                'shortName' => $catResp['shortName'] ?? substr($catResp['name'] ?? $catResp['id'], 0, 50),
                'dataDimensionType' => $catResp['dataDimensionType'] ?? 'DISAGGREGATION',
                'categoryOptions' => $this->refs($catResp['categoryOptions'] ?? [])
            ];
            $this->addOptional($category, 'code', $catResp);
            $categories[] = $category;

            foreach ($catResp['categoryOptions'] ?? [] as $co) {
                if (!empty($co['id'])) {
                    $optionIdSet[$co['id']] = true;
                }
            }
        }

        $categoryOptionCombos = [];
        foreach ($comboResp['categoryOptionCombos'] ?? [] as $coc) {
            $this->logStep("Requête CategoryOptionCombo {$coc['id']}");
            $cocResp = $this->makeRequest("/api/categoryOptionCombos/{$coc['id']}?fields=" . urlencode('id,name,categoryOptions[id]'));
            $categoryOptionCombos[] = [
                'id' => $cocResp['id'],
                'name' => $cocResp['name'] ?? $cocResp['id'],
                'categoryCombo' => ['id' => $categoryComboId],
                'categoryOptions' => $this->refs($cocResp['categoryOptions'] ?? [])
            ];
        }

        $categoryOptions = [];
        foreach (array_keys($optionIdSet) as $optId) {
            $this->logStep("Requête CategoryOption {$optId}");
            $optResp = $this->makeRequest("/api/categoryOptions/{$optId}?fields=" . urlencode('id,name,shortName,code'));
            $option = [
                'id' => $optResp['id'],
                'name' => $optResp['name'] ?? $optId,
                'shortName' => $optResp['shortName'] ?? substr($optResp['name'] ?? $optId, 0, 50)
            ];
            $this->addOptional($option, 'code', $optResp);
            $categoryOptions[] = $option;
        }

        $combo = [
            'id' => $comboResp['id'],
            'name' => $comboResp['name'] ?? $comboResp['id'],
            'shortName' => $comboResp['shortName'] ?? substr($comboResp['name'] ?? $comboResp['id'], 0, 50),
            'dataDimensionType' => $comboResp['dataDimensionType'] ?? 'DISAGGREGATION',
            'categories' => $this->refs($comboResp['categories'] ?? [])
        ];
        $this->addOptional($combo, 'code', $comboResp);

        $result = [
            'categoryCombos' => [$combo],
            'categories' => $categories,
            'categoryOptions' => $categoryOptions,
            'categoryOptionCombos' => $categoryOptionCombos,
            'categoryOptionGroups' => [],
            'categoryOptionGroupSets' => []
        ];

        if ($includeGroups) {
            $this->logStep("Recherche CategoryOptionGroups liés à {$categoryComboId}");
            $result['categoryOptionGroups'] = $this->getCategoryOptionGroups($optionIdSet);
        }
        if ($includeGroupSets && !empty($result['categoryOptionGroups'])) {
            $this->logStep("Recherche CategoryOptionGroupSets liés à {$categoryComboId}");
            $result['categoryOptionGroupSets'] = $this->getCategoryOptionGroupSets($result['categoryOptionGroups']);
        }

        return $result;
    }

    private function getCategoryOptionGroups($optionIdSet)
    {
        $this->logStep('Requête liste complète CategoryOptionGroups');
        $resp = $this->makeRequest("/api/categoryOptionGroups?fields=" . urlencode('id,name,shortName,code,categoryOptions[id]') . "&paging=false");
        $groups = [];

        foreach ($resp['categoryOptionGroups'] ?? [] as $group) {
            $hasRelevantOption = false;
            foreach ($group['categoryOptions'] ?? [] as $co) {
                if (isset($optionIdSet[$co['id']])) {
                    $hasRelevantOption = true;
                    break;
                }
            }

            if ($hasRelevantOption) {
                $export = [
                    'id' => $group['id'],
                    'name' => $group['name'] ?? $group['id'],
                    'shortName' => $group['shortName'] ?? substr($group['name'] ?? $group['id'], 0, 50),
                    'categoryOptions' => $this->refs($group['categoryOptions'] ?? [])
                ];
                $this->addOptional($export, 'code', $group);
                $groups[] = $export;
            }
        }

        $this->logStep(count($groups) . ' CategoryOptionGroup(s) lié(s) trouvé(s)');
        return $groups;
    }

    private function getCategoryOptionGroupSets($categoryOptionGroups)
    {
        $groupIds = [];
        foreach ($categoryOptionGroups as $group) {
            $groupIds[$group['id']] = true;
        }

        $this->logStep('Requête liste complète CategoryOptionGroupSets');
        $resp = $this->makeRequest("/api/categoryOptionGroupSets?fields=" . urlencode('id,name,shortName,code,categoryOptionGroups[id]') . "&paging=false");
        $groupSets = [];

        foreach ($resp['categoryOptionGroupSets'] ?? [] as $groupSet) {
            $hasRelevantGroup = false;
            foreach ($groupSet['categoryOptionGroups'] ?? [] as $group) {
                if (isset($groupIds[$group['id']])) {
                    $hasRelevantGroup = true;
                    break;
                }
            }

            if ($hasRelevantGroup) {
                $export = [
                    'id' => $groupSet['id'],
                    'name' => $groupSet['name'] ?? $groupSet['id'],
                    'shortName' => $groupSet['shortName'] ?? substr($groupSet['name'] ?? $groupSet['id'], 0, 50),
                    'categoryOptionGroups' => $this->refs($groupSet['categoryOptionGroups'] ?? [])
                ];
                $this->addOptional($export, 'code', $groupSet);
                $groupSets[] = $export;
            }
        }

        $this->logStep(count($groupSets) . ' CategoryOptionGroupSet(s) lié(s) trouvé(s)');
        return $groupSets;
    }

    private function mergeComboExports($exports, $includeGroups, $includeGroupSets)
    {
        $merged = [
            'categoryCombos' => [],
            'categories' => [],
            'categoryOptions' => [],
            'categoryOptionCombos' => [],
            'categoryOptionGroups' => [],
            'categoryOptionGroupSets' => []
        ];

        foreach ($exports as $export) {
            foreach ($merged as $key => $_) {
                if (($key === 'categoryOptionGroups' && !$includeGroups) || ($key === 'categoryOptionGroupSets' && !$includeGroupSets)) {
                    continue;
                }
                $merged[$key] = array_merge($merged[$key], $export[$key] ?? []);
            }
        }

        return $merged;
    }

    private function parseUids($input)
    {
        $raw = preg_split('/[,;]/', $input);
        $raw = array_map('trim', $raw);
        $raw = array_filter($raw, function ($uid) {
            return strlen($uid) === 11;
        });

        return array_values(array_unique($raw));
    }

    private function refs($items)
    {
        return array_values(array_filter(array_map(function ($item) {
            return !empty($item['id']) ? ['id' => $item['id']] : null;
        }, $items)));
    }

    private function greyedFieldRefs($items)
    {
        return array_values(array_filter(array_map(function ($item) {
            if (empty($item['dataElement']['id']) || empty($item['categoryOptionCombo']['id'])) {
                return null;
            }
            return [
                'dataElement' => ['id' => $item['dataElement']['id']],
                'categoryOptionCombo' => ['id' => $item['categoryOptionCombo']['id']]
            ];
        }, $items)));
    }

    private function addOptional(&$target, $key, $source)
    {
        if (isset($source[$key]) && $source[$key] !== '') {
            $target[$key] = $source[$key];
        }
    }

    private function initRequestLog($requestId)
    {
        $cleanId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $requestId);
        if ($cleanId === '') {
            $cleanId = date('YmdHis') . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
        }

        $this->requestId = substr($cleanId, 0, 80);
        $logDir = dirname(__DIR__) . '/exports';
        if (!is_dir($logDir)) {
            mkdir($logDir, 0775, true);
        }

        $this->logFile = $logDir . '/form-export-' . $this->requestId . '.log';
        file_put_contents($this->logFile, '');
        $this->logStep('Journal initialisé: ' . $this->requestId);
    }

    private function logStep($message)
    {
        $line = '[' . date('Y-m-d H:i:s') . '] ' . $message . PHP_EOL;
        error_log('[form-export:' . $this->requestId . '] ' . $message);

        if ($this->logFile) {
            file_put_contents($this->logFile, $line, FILE_APPEND | LOCK_EX);
        }
    }

    private function uniqueById($items)
    {
        $map = [];
        foreach ($items as $item) {
            if (isset($item['id'])) {
                $map[$item['id']] = $item;
            }
        }

        return array_values($map);
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
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (strpos($contentType, 'application/json') !== false) {
            $rawInput = file_get_contents('php://input');
            $data = json_decode($rawInput, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('JSON invalide: ' . json_last_error_msg());
            }

            return $data;
        }

        return $_POST;
    }

    private function makeRequest($endpoint)
    {
        $startedAt = microtime(true);
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->dhis2Url . $endpoint,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_UNRESTRICTED_AUTH => true, // Conserver l'auth lors des redirections entre hôtes (ex: play.dhis2.org -> play.im.dhis2.org)
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: ' . $this->dhis2Auth
            ]
        ]);

        $response = curl_exec($ch);
        if (curl_errno($ch)) {
            $error = curl_error($ch);
            throw new Exception("Erreur cURL: {$error}");
        }

        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        $decoded = json_decode($response, true);
        if ($httpCode >= 400) {
            throw new Exception($this->extractErrorMessage($decoded, $httpCode));
        }

        $duration = round((microtime(true) - $startedAt) * 1000);
        $this->logStep("Réponse DHIS2 HTTP {$httpCode} en {$duration} ms");

        return is_array($decoded) ? $decoded : [];
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

        return "Erreur HTTP {$httpCode}";
    }

    private function sendResponse($success, $message, $data = null, $httpCode = 200)
    {
        http_response_code($httpCode);
        $response = [
            'success' => $success,
            'message' => $message,
            'timestamp' => date('Y-m-d H:i:s')
        ];

        if ($data !== null) {
            $response = array_merge($response, $data);
        }

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }
}

try {
    $api = new FormExportAPI();
    $api->handleRequest();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
