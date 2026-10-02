<?php
/**
 * API Module: Assign Organisation Units to Groups
 * Endpoint dédié pour assigner des groupes aux structures organisationnelles
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

class AssignOrgUnitsGroupsAPI
{
    private $dhis2Url;
    private $dhis2Auth;

    public function handleRequest()
    {
        try {
            $action = $_GET['action'] ?? 'list';

            switch ($action) {
                case 'list':
                    $this->listOrgUnitsWithGroups();
                    break;

                case 'groups':
                    $this->getGroups();
                    break;

                case 'stats':
                    $this->getStats();
                    break;

                case 'assign':
                    $this->assignGroupsToOrgUnits();
                    break;

                default:
                    throw new Exception('Action non reconnue');
            }
        } catch (Exception $e) {
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    /**
     * Récupérer les groupes d'unités d'organisation
     */
    private function getGroups()
    {
        $this->loadDHIS2Config();

        $endpoint = '/api/organisationUnitGroups?fields=id,displayName,name&paging=false';
        $response = $this->makeRequest($endpoint, 'GET');

        $groups = $response['organisationUnitGroups'] ?? [];
        usort($groups, fn($a, $b) => strcasecmp($a['displayName'], $b['displayName']));

        $this->sendResponse(true, 'Groupes récupérés', [
            'groups' => $groups,
            'total' => count($groups)
        ]);
    }

    /**
     * Récupérer les structures avec leurs groupes et catégoriser
     */
    private function listOrgUnitsWithGroups()
    {
        $this->loadDHIS2Config();
        $input = $this->getRequestData();

        // Récupérer toutes les structures avec leurs groupes
        $endpoint = '/api/organisationUnits?fields=id,displayName,path,level,parent[displayName],organisationUnitGroups[id,displayName]&paging=false';
        $response = $this->makeRequest($endpoint, 'GET');

        $allOrgUnits = $response['organisationUnits'] ?? [];

        // Catégoriser les structures
        $categorized = $this->categorizeOrgUnits($allOrgUnits);

        $this->sendResponse(true, 'Structures récupérées', [
            'categorized' => $categorized,
            'totals' => [
                'without_groups' => count($categorized['without_groups']),
                'incomplete_groups' => count($categorized['incomplete_groups']),
                'complete' => count($categorized['complete']),
                'total' => count($allOrgUnits)
            ]
        ]);
    }

    /**
     * Catégoriser les structures par état de groupes
     */
    private function categorizeOrgUnits($orgUnits)
    {
        // Récupérer le nombre total de groupes
        $endpoint = '/api/organisationUnitGroups?paging=false';
        $response = $this->makeRequest($endpoint, 'GET');
        $totalGroups = count($response['organisationUnitGroups'] ?? []);

        $categorized = [
            'without_groups' => [],
            'incomplete_groups' => [],
            'complete' => []
        ];

        foreach ($orgUnits as $ou) {
            $groups = $ou['organisationUnitGroups'] ?? [];
            $groupCount = count($groups);

            $ouData = [
                'id' => $ou['id'],
                'displayName' => $ou['displayName'],
                'path' => $ou['path'],
                'level' => $ou['level'] ?? null,
                'parent' => $ou['parent']['displayName'] ?? '',
                'groups' => $groups,
                'groupCount' => $groupCount
            ];

            if ($groupCount === 0) {
                $categorized['without_groups'][] = $ouData;
            } elseif ($groupCount < $totalGroups) {
                $categorized['incomplete_groups'][] = $ouData;
            } else {
                $categorized['complete'][] = $ouData;
            }
        }

        // Trier chaque catégorie par displayName
        foreach ($categorized as &$category) {
            usort($category, fn($a, $b) => strcasecmp($a['displayName'], $b['displayName']));
        }

        return $categorized;
    }

    /**
     * Récupérer les statistiques
     */
    private function getStats()
    {
        $this->loadDHIS2Config();

        $endpoint = '/api/organisationUnits?fields=id&paging=true&pageSize=1';
        $response = $this->makeRequest($endpoint, 'GET');
        $totalOrgUnits = $response['pager']['total'] ?? 0;

        $endpoint = '/api/organisationUnitGroups?paging=true&pageSize=1';
        $response = $this->makeRequest($endpoint, 'GET');
        $totalGroups = $response['pager']['total'] ?? 0;

        $this->sendResponse(true, 'Statistiques récupérées', [
            'totalOrgUnits' => $totalOrgUnits,
            'totalGroups' => $totalGroups
        ]);
    }

    /**
     * Assigner les groupes aux structures
     */
    private function assignGroupsToOrgUnits()
    {
        $this->loadDHIS2Config();
        $input = $this->getRequestData();

        $assignments = $input['assignments'] ?? [];
        if (empty($assignments)) {
            throw new Exception('Aucune affectation fournie');
        }

        set_time_limit(300);

        $results = [
            'success' => [],
            'failed' => []
        ];

        foreach ($assignments as $assignment) {
            $ouId = $assignment['ouId'] ?? null;
            $groupIds = $assignment['groupIds'] ?? [];

            if (!$ouId) {
                continue;
            }

            try {
                $current = $this->makeRequest("/api/organisationUnits/{$ouId}?fields=organisationUnitGroups[id]", 'GET');
                $currentIds = array_column($current['organisationUnitGroups'] ?? [], 'id');

                $toAdd = array_diff($groupIds, $currentIds);
                $toRemove = array_diff($currentIds, $groupIds);

                foreach ($toAdd as $gid) {
                    $this->makeRequest("/api/organisationUnitGroups/{$gid}/organisationUnits/{$ouId}", 'POST');
                }
                foreach ($toRemove as $gid) {
                    $this->makeRequest("/api/organisationUnitGroups/{$gid}/organisationUnits/{$ouId}", 'DELETE');
                }

                $results['success'][] = [
                    'ouId' => $ouId,
                    'added' => count($toAdd),
                    'removed' => count($toRemove)
                ];
            } catch (Exception $e) {
                $results['failed'][] = [
                    'ouId' => $ouId,
                    'error' => $e->getMessage()
                ];
            }
        }

        $this->sendResponse(true, 'Affectations appliquées', [
            'results' => $results,
            'totalProcessed' => count($assignments),
            'successCount' => count($results['success']),
            'failedCount' => count($results['failed'])
        ]);
    }

    /**
     * Charger la configuration DHIS2
     */
    private function loadDHIS2Config()
    {
        $input = $this->getRequestData();

        if (empty($input['dhis2_url']) || empty($input['dhis2_auth'])) {
            throw new Exception('Configuration DHIS2 manquante');
        }

        $this->dhis2Url = rtrim($input['dhis2_url'], '/');
        $this->dhis2Auth = $input['dhis2_auth'];
    }

    /**
     * Faire une requête HTTP à DHIS2
     */
    private function makeRequest($endpoint, $method = 'GET', $data = null)
    {
        $fullUrl = $this->dhis2Url . $endpoint;
        $ch = curl_init();

        $curlOptions = [
            CURLOPT_URL => $fullUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_UNRESTRICTED_AUTH => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: ' . $this->dhis2Auth
            ]
        ];

        if ($method !== 'GET') {
            $curlOptions[CURLOPT_CUSTOMREQUEST] = $method;
            if ($data !== null) {
                $curlOptions[CURLOPT_POSTFIELDS] = json_encode($data);
            }
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

        return $decodedResponse ?? [];
    }

    /**
     * Extraire le message d'erreur de la réponse DHIS2
     */
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

    /**
     * Récupérer les données de la requête
     */
    private function getRequestData()
    {
        $rawData = file_get_contents('php://input');
        return json_decode($rawData, true) ?? [];
    }

    /**
     * Envoyer une réponse JSON
     */
    private function sendResponse($success, $message, $data = null, $code = 200)
    {
        http_response_code($code);
        echo json_encode([
            'success' => $success,
            'message' => $message,
            'data' => $data
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit();
    }
}

$api = new AssignOrgUnitsGroupsAPI();
$api->handleRequest();
