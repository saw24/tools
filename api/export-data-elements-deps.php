<?php
/**
 * API Module: Export Data Elements with Dependencies
 * Endpoint pour exporter des éléments de données avec toutes leurs dépendances
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

/**
 * Classe pour gérer l'export des data elements avec dépendances
 */
class DataElementExportAPI
{
    private $dhis2Url;
    private $dhis2Auth;

    public function handleRequest()
    {
        try {
            $this->loadDHIS2Config();
            $input = $this->getRequestData();

            $dataElementUids = $input['dataElementUids'] ?? '';
            $includeGroups = $input['includeGroups'] ?? true;
            $includeGroupSets = $input['includeGroupSets'] ?? true;

            if (empty($dataElementUids)) {
                throw new Exception('dataElementUids est requis');
            }

            // Parser les UID
            $rawUids = preg_split('/[,;]/', $dataElementUids);
            $rawUids = array_map('trim', $rawUids);
            $rawUids = array_filter($rawUids, function ($uid) {
                return strlen($uid) === 11;
            });

            $uniqueUids = array_unique($rawUids);

            if (empty($uniqueUids)) {
                throw new Exception('Aucun UID valide trouvé. Les UID DHIS2 doivent avoir 11 caractères.');
            }

            error_log("📦 Export de " . count($uniqueUids) . " DataElement(s): " . implode(', ', $uniqueUids));

            $allDataElements = [];
            $allComboExports = [];

            // Récupérer chaque DataElement + son combo
            foreach ($uniqueUids as $uid) {
                try {
                    $deFields = 'id,name,shortName,description,aggregationType,domainType,valueType,zeroIsSignificant,categoryCombo[id]';
                    $deResp = $this->makeRequest("/api/dataElements/{$uid}?fields=" . urlencode($deFields));

                    if (!isset($deResp['categoryCombo']['id'])) {
                        error_log("⚠️ DataElement {$uid} sans CategoryCombo, ignoré.");
                        continue;
                    }

                    $dataElement = [
                        'id' => $deResp['id'],
                        'name' => $deResp['name'],
                        'shortName' => $deResp['shortName'] ?? substr($deResp['name'] ?? $deResp['id'], 0, 50),
                        'description' => $deResp['description'] ?? '',
                        'aggregationType' => $deResp['aggregationType'] ?? 'SUM',
                        'domainType' => $deResp['domainType'] ?? 'AGGREGATE',
                        'valueType' => $deResp['valueType'] ?? 'TEXT',
                        'zeroIsSignificant' => $deResp['zeroIsSignificant'] ?? false,
                        'categoryCombo' => ['id' => $deResp['categoryCombo']['id']]
                    ];

                    $allDataElements[] = $dataElement;

                    // Exporter le combo associé
                    $comboExport = $this->exportCategoryCombo(
                        $deResp['categoryCombo']['id'],
                        $includeGroups,
                        $includeGroupSets
                    );
                    $allComboExports[] = $comboExport;

                } catch (Exception $e) {
                    error_log("❌ Erreur DataElement {$uid}: " . $e->getMessage());
                    continue;
                }
            }

            if (empty($allDataElements)) {
                throw new Exception('Aucun DataElement valide trouvé.');
            }

            // Fusionner toutes les dépendances
            $merged = $this->mergeExports($allComboExports, $includeGroups, $includeGroupSets);

            // Dé-duplication
            $exportPackage = [
                'dataElements' => $this->uniqueById($allDataElements),
                'categoryCombos' => $this->uniqueById($merged['categoryCombos']),
                'categories' => $this->uniqueById($merged['categories']),
                'categoryOptions' => $this->uniqueById($merged['categoryOptions']),
                'categoryOptionCombos' => $this->uniqueById($merged['categoryOptionCombos']),
                'categoryOptionGroups' => $includeGroups ? $this->uniqueById($merged['categoryOptionGroups']) : [],
                'categoryOptionGroupSets' => $includeGroupSets ? $this->uniqueById($merged['categoryOptionGroupSets']) : []
            ];

            $summary = [
                'dataElements' => count($exportPackage['dataElements']),
                'categoryCombos' => count($exportPackage['categoryCombos']),
                'categories' => count($exportPackage['categories']),
                'categoryOptions' => count($exportPackage['categoryOptions']),
                'categoryOptionCombos' => count($exportPackage['categoryOptionCombos']),
                'categoryOptionGroups' => count($exportPackage['categoryOptionGroups']),
                'categoryOptionGroupSets' => count($exportPackage['categoryOptionGroupSets'])
            ];

            error_log('✅ Export multi-DataElement terminé ! ' . json_encode($summary));

            $this->sendResponse(true, "Export de {$summary['dataElements']} DataElement(s) réussi", [
                'dataElementCount' => $summary['dataElements'],
                'data' => $exportPackage,
                'summary' => $summary
            ]);

        } catch (Exception $e) {
            error_log('❌ Erreur serveur: ' . $e->getMessage());
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    private function exportCategoryCombo($categoryComboId, $includeGroups, $includeGroupSets)
    {
        $comboFields = 'id,name,shortName,dataDimensionType,categories[id],categoryOptionCombos[id]';
        $comboResp = $this->makeRequest("/api/categoryCombos/{$categoryComboId}?fields=" . urlencode($comboFields));

        $categoryIds = array_map(function ($c) {
            return $c['id']; }, $comboResp['categories'] ?? []);
        $categories = [];
        $optionIdSet = [];

        // Récupérer les catégories
        foreach ($categoryIds as $catId) {
            $catFields = 'id,name,shortName,dataDimensionType,categoryOptions[id]';
            $catResp = $this->makeRequest("/api/categories/{$catId}?fields=" . urlencode($catFields));

            $categories[] = [
                'id' => $catResp['id'],
                'name' => $catResp['name'],
                'shortName' => $catResp['shortName'] ?? substr($catResp['name'] ?? $catResp['id'], 0, 50),
                'dataDimensionType' => $catResp['dataDimensionType'] ?? 'DISAGGREGATION',
                'categoryOptions' => array_map(function ($co) {
                    return ['id' => $co['id']]; }, $catResp['categoryOptions'] ?? [])
            ];

            foreach ($catResp['categoryOptions'] ?? [] as $co) {
                $optionIdSet[$co['id']] = true;
            }
        }

        // Récupérer les COC
        $cocIds = array_map(function ($coc) {
            return $coc['id']; }, $comboResp['categoryOptionCombos'] ?? []);
        $categoryOptionCombos = [];

        foreach ($cocIds as $cocId) {
            $cocFields = 'id,categoryOptions[id]';
            $cocResp = $this->makeRequest("/api/categoryOptionCombos/{$cocId}?fields=" . urlencode($cocFields));

            $categoryOptionCombos[] = [
                'id' => $cocResp['id'],
                'aggregationType' => 'SUM',
                'dimensionItemType' => 'CATEGORY_OPTION',
                'categoryCombo' => ['id' => $categoryComboId],
                'categoryOptions' => array_map(function ($co) {
                    return ['id' => $co['id']]; }, $cocResp['categoryOptions'] ?? [])
            ];
        }

        // Récupérer les options
        $optionIds = array_keys($optionIdSet);
        $categoryOptions = [];

        foreach ($optionIds as $optId) {
            try {
                $optFields = 'id,name,shortName';
                $optResp = $this->makeRequest("/api/categoryOptions/{$optId}?fields=" . urlencode($optFields));

                $categoryOptions[] = [
                    'id' => $optResp['id'],
                    'name' => $optResp['name'] ?? $optId,
                    'shortName' => $optResp['shortName'] ?? substr($optResp['name'] ?? $optId, 0, 50),
                    'aggregationType' => 'SUM'
                ];
            } catch (Exception $e) {
                $categoryOptions[] = [
                    'id' => $optId,
                    'name' => "UNKNOWN ({$optId})",
                    'shortName' => substr($optId, 0, 50),
                    'aggregationType' => 'SUM'
                ];
            }
        }

        $result = [
            'categoryCombos' => [
                [
                    'id' => $comboResp['id'],
                    'name' => $comboResp['name'],
                    'shortName' => $comboResp['shortName'] ?? substr($comboResp['name'] ?? $comboResp['id'], 0, 50),
                    'dataDimensionType' => $comboResp['dataDimensionType'] ?? 'DISAGGREGATION',
                    'categories' => array_map(function ($c) {
                        return ['id' => $c['id']]; }, $comboResp['categories'] ?? [])
                ]
            ],
            'categories' => $categories,
            'categoryOptions' => $categoryOptions,
            'categoryOptionCombos' => $categoryOptionCombos,
            'categoryOptionGroups' => [],
            'categoryOptionGroupSets' => []
        ];

        // Groupes
        if ($includeGroups) {
            $result['categoryOptionGroups'] = $this->getCategoryOptionGroups($optionIdSet);
        }

        // GroupSets
        if ($includeGroupSets && !empty($result['categoryOptionGroups'])) {
            $result['categoryOptionGroupSets'] = $this->getCategoryOptionGroupSets($result['categoryOptionGroups']);
        }

        return $result;
    }

    private function getCategoryOptionGroups($optionIdSet)
    {
        $groupFields = 'id,name,shortName,categoryOptions[id]';
        $groupsResp = $this->makeRequest("/api/categoryOptionGroups?fields=" . urlencode($groupFields) . "&paging=false");

        $allGroups = $groupsResp['categoryOptionGroups'] ?? [];
        $relevantGroups = [];

        foreach ($allGroups as $group) {
            $hasRelevantOption = false;
            foreach ($group['categoryOptions'] ?? [] as $co) {
                if (isset($optionIdSet[$co['id']])) {
                    $hasRelevantOption = true;
                    break;
                }
            }

            if ($hasRelevantOption) {
                $relevantGroups[] = [
                    'id' => $group['id'],
                    'name' => $group['name'],
                    'shortName' => $group['shortName'] ?? substr($group['name'] ?? $group['id'], 0, 50),
                    'categoryOptions' => array_map(function ($co) {
                        return ['id' => $co['id']]; }, $group['categoryOptions'] ?? [])
                ];
            }
        }

        return $relevantGroups;
    }

    private function getCategoryOptionGroupSets($categoryOptionGroups)
    {
        $groupIds = [];
        foreach ($categoryOptionGroups as $g) {
            $groupIds[$g['id']] = true;
        }

        $groupSetFields = 'id,name,shortName,categoryOptionGroups[id]';
        $groupSetsResp = $this->makeRequest("/api/categoryOptionGroupSets?fields=" . urlencode($groupSetFields) . "&paging=false");

        $allGroupSets = $groupSetsResp['categoryOptionGroupSets'] ?? [];
        $relevantGroupSets = [];

        foreach ($allGroupSets as $gs) {
            $hasRelevantGroup = false;
            foreach ($gs['categoryOptionGroups'] ?? [] as $g) {
                if (isset($groupIds[$g['id']])) {
                    $hasRelevantGroup = true;
                    break;
                }
            }

            if ($hasRelevantGroup) {
                $relevantGroupSets[] = [
                    'id' => $gs['id'],
                    'name' => $gs['name'],
                    'shortName' => $gs['shortName'] ?? substr($gs['name'] ?? $gs['id'], 0, 50),
                    'categoryOptionGroups' => array_map(function ($g) {
                        return ['id' => $g['id']]; }, $gs['categoryOptionGroups'] ?? [])
                ];
            }
        }

        return $relevantGroupSets;
    }

    private function mergeExports($exports, $includeGroups, $includeGroupSets)
    {
        $merged = [
            'categoryCombos' => [],
            'categories' => [],
            'categoryOptions' => [],
            'categoryOptionCombos' => [],
            'categoryOptionGroups' => [],
            'categoryOptionGroupSets' => []
        ];

        foreach ($exports as $exp) {
            $merged['categoryCombos'] = array_merge($merged['categoryCombos'], $exp['categoryCombos']);
            $merged['categories'] = array_merge($merged['categories'], $exp['categories']);
            $merged['categoryOptions'] = array_merge($merged['categoryOptions'], $exp['categoryOptions']);
            $merged['categoryOptionCombos'] = array_merge($merged['categoryOptionCombos'], $exp['categoryOptionCombos']);

            if ($includeGroups) {
                $merged['categoryOptionGroups'] = array_merge($merged['categoryOptionGroups'], $exp['categoryOptionGroups']);
            }

            if ($includeGroupSets) {
                $merged['categoryOptionGroupSets'] = array_merge($merged['categoryOptionGroupSets'], $exp['categoryOptionGroupSets']);
            }
        }

        return $merged;
    }

    private function uniqueById($arr)
    {
        $map = [];
        foreach ($arr as $item) {
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

    private function makeRequest($endpoint, $method = 'GET', $body = null)
    {
        $fullUrl = $this->dhis2Url . $endpoint;

        $ch = curl_init();

        $curlOptions = [
            CURLOPT_URL => $fullUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_UNRESTRICTED_AUTH => true, // Conserver l'auth lors des redirections entre hôtes (ex: play.dhis2.org -> play.im.dhis2.org)
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: ' . $this->dhis2Auth
            ]
        ];

        if ($method === 'POST' && $body) {
            $curlOptions[CURLOPT_POST] = true;
            $curlOptions[CURLOPT_POSTFIELDS] = json_encode($body);
        }

        curl_setopt_array($ch, $curlOptions);

        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            throw new Exception("Erreur cURL: $error");
        }

        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

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
            500 => 'Erreur serveur DHIS2'
        ];

        return $defaultMessages[$httpCode] ?? "Erreur HTTP $httpCode";
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

// Point d'entrée
try {
    $api = new DataElementExportAPI();
    $api->handleRequest();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
