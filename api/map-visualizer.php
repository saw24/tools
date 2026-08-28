<?php
/**
 * API Module: Map Visualizer
 * Endpoint pour récupérer les données géographiques des unités d'organisation DHIS2
 */

// Configuration des headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Gérer les requêtes preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

error_reporting(E_ALL);
ini_set('display_errors', 0);

class MapVisualizerAPI
{
    private $dhis2Url;
    private $dhis2Auth;

    public function handleRequest()
    {
        try {
            $action = $_GET['action'] ?? 'fetch';

            switch ($action) {
                case 'fetch_layer':
                    $this->fetchLayerData();
                    break;
                case 'groups':
                    $this->getGroups();
                    break;
                default:
                    throw new Exception('Action non reconnue');
            }
        } catch (Exception $e) {
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    private function fetchLayerData()
    {
        $this->loadDHIS2Config();
        $input = $this->getRequestData();

        $parentId = $input['parentId'] ?? '';
        $includeDescendants = isset($input['includeDescendants']) && ($input['includeDescendants'] === true || $input['includeDescendants'] === 'true');
        $groupId = $input['groupId'] ?? '';

        if (empty($parentId)) {
            throw new Exception("L'ID de l'unité parente est obligatoire");
        }

        // 1. D'abord récupérer l'unité d'organisation pour obtenir son path et ses données complètes
        $fields = 'id,displayName,name,geometry,path,organisationUnitGroups[id,displayName]';
        $parentEndpoint = "/api/organisationUnits/{$parentId}?fields={$fields}";
        $parentData = $this->makeRequest($parentEndpoint, 'GET');

        $organisationUnits = [];
        $fields = 'id,displayName,name,geometry,path,organisationUnitGroups[id,displayName]';

        if ($includeDescendants) {
            // Récupérer tous les descendants (y compris le parent)
            $path = $parentData['path'];
            $endpoint = "/api/organisationUnits?fields={$fields}&filter=path:like:{$path}&paging=false";

            // Ajouter le filtre de groupe si présent
            if (!empty($groupId)) {
                $endpoint .= "&filter=organisationUnitGroups.id:eq:{$groupId}";
            }

            $response = $this->makeRequest($endpoint, 'GET');
            $organisationUnits = $response['organisationUnits'] ?? [];
        } else {
            // Juste le parent (si il matche le groupe si spécifié)
            if (!empty($groupId)) {
                $checkEndpoint = "/api/organisationUnits/{$parentId}?fields=id,organisationUnitGroups[id]";
                $checkData = $this->makeRequest($checkEndpoint, 'GET');
                $matchesGroup = false;
                if (isset($checkData['organisationUnitGroups'])) {
                    foreach ($checkData['organisationUnitGroups'] as $g) {
                        if ($g['id'] === $groupId) {
                            $matchesGroup = true;
                            break;
                        }
                    }
                }
                if ($matchesGroup) {
                    $organisationUnits = [$parentData];
                }
            } else {
                $organisationUnits = [$parentData];
            }
        }

        // 2. Filtrer uniquement les unités avec géométrie
        $features = [];
        foreach ($organisationUnits as $ou) {
            if (isset($ou['geometry']) && !empty($ou['geometry']['coordinates'])) {
                $features[] = [
                    'id' => $ou['id'],
                    'name' => $ou['displayName'] ?? $ou['name'],
                    'geometry' => $ou['geometry'],
                    'groups' => array_map(function ($g) {
                        return $g['displayName'];
                    }, $ou['organisationUnitGroups'] ?? [])
                ];
            }
        }

        $this->sendResponse(true, 'Données récupérées', [
            'features' => $features,
            'total' => count($features),
            'parent' => [
                'id' => $parentData['id'],
                'name' => $parentData['displayName']
            ]
        ]);
    }

    private function getGroups()
    {
        $this->loadDHIS2Config();
        $endpoint = '/api/organisationUnitGroups?fields=id,displayName&paging=false';
        $response = $this->makeRequest($endpoint, 'GET');
        $this->sendResponse(true, 'Groupes récupérés', $response['organisationUnitGroups'] ?? []);
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
            return json_decode($rawInput, true);
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
            CURLOPT_TIMEOUT => 60,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: ' . $this->dhis2Auth
            ]
        ];
        curl_setopt_array($ch, $curlOptions);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $decoded = json_decode($response, true);
        if ($httpCode >= 400) {
            throw new Exception($decoded['message'] ?? "Erreur HTTP $httpCode");
        }
        return $decoded;
    }

    private function sendResponse($success, $message, $data = null, $httpCode = 200)
    {
        http_response_code($httpCode);
        echo json_encode([
            'success' => $success,
            'message' => $message,
            'data' => $data,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        exit();
    }
}

$api = new MapVisualizerAPI();
$api->handleRequest();
