<?php
/**
 * API Module: Export Organisation Units
 * Endpoint dédié pour l'export des unités d'organisation avec leurs ancêtres et groupes
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

// Activer l'affichage des erreurs pour le développement
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

/**
 * Classe pour gérer l'export des unités d'organisation
 */
class OrganisationUnitsExportAPI
{
    private $dhis2Url;
    private $dhis2Auth;

    /**
     * Point d'entrée principal
     */
    public function handleRequest()
    {
        try {
            $action = $_GET['action'] ?? 'export';

            switch ($action) {
                case 'export':
                    $this->exportOrganisationUnits();
                    break;

                case 'count':
                    $this->countOrganisationUnits();
                    break;

                case 'groups':
                    $this->getOrganisationUnitGroups();
                    break;

                default:
                    throw new Exception('Action non reconnue');
            }
        } catch (Exception $e) {
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    /**
     * Récupérer la liste des groupes d'unités d'organisation
     */
    private function getOrganisationUnitGroups()
    {
        $this->loadDHIS2Config();

        $endpoint = '/api/organisationUnitGroups?fields=id,displayName,name&paging=false';
        $response = $this->makeRequest($endpoint, 'GET');

        $groups = $response['organisationUnitGroups'] ?? [];

        $this->sendResponse(true, 'Groupes récupérés', [
            'groups' => $groups,
            'total' => count($groups)
        ]);
    }

    /**
     * Compter les unités d'organisation
     */
    private function countOrganisationUnits()
    {
        $this->loadDHIS2Config();

        $endpoint = '/api/organisationUnits?fields=id&paging=true&pageSize=1';
        $response = $this->makeRequest($endpoint, 'GET');

        $count = $response['pager']['total'] ?? 0;

        $this->sendResponse(true, 'Nombre d\'unités d\'organisation récupéré', [
            'total' => $count
        ]);
    }

    /**
     * Exporter toutes les unités d'organisation avec leurs détails
     */
    private function exportOrganisationUnits()
    {
        $this->loadDHIS2Config();

        // Récupérer les paramètres de filtre depuis la requête
        $input = $this->getRequestData();
        $filterType = $input['filterType'] ?? 'all';
        $includeDescendants = isset($input['includeDescendants']) && ($input['includeDescendants'] === true || $input['includeDescendants'] === 'true');

        // Construire l'endpoint initial en fonction du type de filtre
        $endpoint = '/api/organisationUnits?';
        $filters = [];

        switch ($filterType) {
            case 'name':
                $nameValue = $input['nameValue'] ?? '';
                $nameOperator = $input['nameOperator'] ?? 'contains';
                if (!empty($nameValue)) {
                    switch ($nameOperator) {
                        case 'equal':
                            $filters[] = "filter=displayName:eq:" . urlencode($nameValue);
                            break;
                        case 'contains':
                            $filters[] = "filter=displayName:ilike:" . urlencode($nameValue);
                            break;
                        case 'startsWith':
                            $filters[] = "filter=displayName:ilike:" . urlencode($nameValue);
                            break;
                    }
                } else {
                    throw new Exception('Le nom de recherche est vide');
                }
                break;

            case 'ids':
                $idsList = $input['idsList'] ?? '';
                if (!empty($idsList)) {
                    $ids = array_map('trim', explode(',', $idsList));
                    $ids = array_filter($ids, function ($id) {
                        return preg_match('/^[a-zA-Z0-9]{11}$/', $id);
                    });
                    if (!empty($ids)) {
                        $filters[] = "filter=id:in:[" . implode(',', $ids) . "]";
                    } else {
                        throw new Exception('Aucun ID valide fourni');
                    }
                } else {
                    throw new Exception('La liste d\'IDs est vide');
                }
                break;

            case 'group':
                $groupId = $input['groupId'] ?? '';
                if (!empty($groupId)) {
                    $filters[] = "filter=organisationUnitGroups.id:eq:" . urlencode($groupId);
                } else {
                    throw new Exception('Le groupe sélectionné est vide');
                }
                break;

            case 'all':
            default:
                // Pas de filtre
                break;
        }

        // Si on demande la descendance, on doit d'abord identifier les racines
        if ($includeDescendants && $filterType !== 'all') {
            // 1. Récupérer les racines d'abord (besoin de 'path' pour trouver la descendance)
            $rootEndpoint = $endpoint . 'fields=id,path,displayName&paging=false';
            if (!empty($filters)) {
                $rootEndpoint .= '&' . implode('&', $filters);
            }

            $rootResponse = $this->makeRequest($rootEndpoint, 'GET');
            $roots = $rootResponse['organisationUnits'] ?? [];

            if (empty($roots)) {
                $this->sendResponse(true, 'Aucun résultat trouvé pour ces critères', [
                    'organisationUnits' => [],
                    'total' => 0,
                    'filterApplied' => $filterType
                ]);
            }

            // 2. Construire une requête qui récupère tout ce qui commence par ces chemins
            // DHIS2 API supporte le filtre can:path:like: ou path:like:
            // Pour être efficace si on a trop de racines, on fait plusieurs requêtes ou un gros filtre
            $allUnitsById = [];

            // On récupère par blocs de 10 racines pour éviter des URLs trop longues
            $chunks = array_chunk($roots, 10);
            foreach ($chunks as $chunk) {
                $descendantFilters = [];
                foreach ($chunk as $root) {
                    $descendantFilters[] = "filter=path:like:" . urlencode($root['path']);
                }

                $fields = 'id,displayName,name,geometry,path,ancestors[id,displayName],organisationUnitGroups[id,displayName]';
                $chunkEndpoint = "/api/organisationUnits?fields={$fields}&paging=false&rootJunction=OR&" . implode('&', $descendantFilters);

                $chunkResponse = $this->makeRequest($chunkEndpoint, 'GET');
                $chunkOUs = $chunkResponse['organisationUnits'] ?? [];

                foreach ($chunkOUs as $ou) {
                    $allUnitsById[$ou['id']] = $ou;
                }
            }

            $organisationUnits = array_values($allUnitsById);
        } else {
            // Requête standard (tous ou filtrés sans descendance)
            $fields = 'id,displayName,name,geometry,path,ancestors[id,displayName],organisationUnitGroups[id,displayName]';
            $endpoint .= 'fields=' . $fields;
            if (!empty($filters)) {
                $endpoint .= '&' . implode('&', $filters);
            }
            $endpoint .= '&paging=false';

            $response = $this->makeRequest($endpoint, 'GET');
            $organisationUnits = $response['organisationUnits'] ?? [];

            // Sécurité : si on avait un filtre mais pas de résultats
            if (empty($organisationUnits) && $filterType !== 'all') {
                $this->sendResponse(true, 'Aucun résultat trouvé pour ces critères', [
                    'organisationUnits' => [],
                    'total' => 0,
                    'filterApplied' => $filterType
                ]);
            }
        }

        // Traiter les données pour l'export
        $processedData = [];
        foreach ($organisationUnits as $ou) {
            $processedData[] = $this->processOrganisationUnit($ou);
        }

        $this->sendResponse(true, 'Unités d\'organisation récupérées', [
            'organisationUnits' => $processedData,
            'total' => count($processedData),
            'filterApplied' => $filterType
        ]);
    }

    /**
     * Traiter une unité d'organisation pour l'export
     */
    private function processOrganisationUnit($ou)
    {
        // ID
        $id = $ou['id'] ?? '';

        // Nom
        $name = $ou['displayName'] ?? $ou['name'] ?? '';

        // Géométrie - Extraire les coordonnées si disponibles
        $geometry = '';
        $geometryType = '';
        $longitude = '';
        $latitude = '';

        if (isset($ou['geometry'])) {
            $geom = $ou['geometry'];
            if (isset($geom['type']) && isset($geom['coordinates'])) {
                $geometryType = $geom['type'];

                // Formater selon le type de géométrie
                if ($geom['type'] === 'Point') {
                    // Point: [longitude, latitude]
                    $coords = $geom['coordinates'];
                    $longitude = $coords[0] ?? '';
                    $latitude = $coords[1] ?? '';
                    $geometry = "Point: [{$longitude}, {$latitude}]";
                } elseif ($geom['type'] === 'Polygon') {
                    // Polygon: afficher le nombre de points pour le résumé
                    $pointCount = count($geom['coordinates'][0] ?? []);
                    $geometry = "Polygon: {$pointCount} points";
                } elseif ($geom['type'] === 'MultiPolygon') {
                    // MultiPolygon
                    $polygonCount = count($geom['coordinates'] ?? []);
                    $geometry = "MultiPolygon: {$polygonCount} polygons";
                } else {
                    $geometry = $geom['type'];
                }
            }
        }

        // Serialiser les coordonnées complètes pour l'export des polygones
        $coordinatesJson = (isset($ou['geometry']['coordinates'])) ? json_encode($ou['geometry']['coordinates']) : '';

        // Ancêtres - Extraire les noms des parents successifs
        $ancestors = [];
        if (isset($ou['ancestors']) && is_array($ou['ancestors'])) {
            foreach ($ou['ancestors'] as $ancestor) {
                $ancestors[] = $ancestor['displayName'] ?? $ancestor['name'] ?? '';
            }
        }
        $ancestorsString = implode('|', $ancestors);

        // Groupes - Extraire les noms des groupes
        $groups = [];
        if (isset($ou['organisationUnitGroups']) && is_array($ou['organisationUnitGroups'])) {
            foreach ($ou['organisationUnitGroups'] as $group) {
                $groups[] = $group['displayName'] ?? $group['name'] ?? '';
            }
        }
        $groupsString = implode('; ', $groups);

        return [
            'id' => $id,
            'name' => $name,
            'geometry' => $geometry, // Résumé lisible
            'geometryType' => $geometryType, // Type brut (Point, Polygon...)
            'coordinates' => $coordinatesJson, // Coordonnées complètes (JSON)
            'longitude' => $longitude,
            'latitude' => $latitude,
            'ancestors' => $ancestorsString,
            'groups' => $groupsString
        ];
    }

    /**
     * Charger la configuration DHIS2 depuis la session
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
     * Obtenir les données de la requête
     */
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

    /**
     * Effectuer une requête vers DHIS2
     */
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
            CURLOPT_TIMEOUT => 120, // Timeout plus long pour les grandes requêtes
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

    /**
     * Extraire le message d'erreur
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
     * Envoyer la réponse JSON
     */
    private function sendResponse($success, $message, $data = null, $httpCode = 200)
    {
        http_response_code($httpCode);

        $response = [
            'success' => $success,
            'message' => $message,
            'timestamp' => date('Y-m-d H:i:s')
        ];

        if ($data !== null) {
            $response['data'] = $data;
        }

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }
}

// Point d'entrée
try {
    $api = new OrganisationUnitsExportAPI();
    $api->handleRequest();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
