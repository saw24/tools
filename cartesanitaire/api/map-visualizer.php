<?php
/**
 * API Module: Map Visualizer
 * Endpoint pour récupérer les données géographiques et statistiques, et gérer la persistance
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'db.php';

error_reporting(E_ALL);
ini_set('display_errors', 0);

class MapVisualizerAPI
{
    private $pdo;
    private $dhis2Url;
    private $dhis2Auth;
    private $requestData = null;

    public function __construct()
    {
        $this->pdo = getStatsDB();
    }

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
                case 'analytics':
                    $this->fetchAnalytics();
                    break;
                case 'save_project':
                    $this->saveProject();
                    break;
                case 'load_projects':
                    $this->loadProjects();
                    break;
                case 'get_project':
                    $this->getProject();
                    break;
                case 'delete_project':
                    $this->deleteProject();
                    break;
                case 'init_db':
                    $this->initDB();
                    break;
                default:
                    throw new Exception('Action non reconnue : ' . $action);
            }
        } catch (Exception $e) {
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    private function initDB()
    {
        if (!$this->pdo)
            throw new Exception("Connexion DB échouée");
        $sql = "CREATE TABLE IF NOT EXISTS t_map_projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            config JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )";
        $this->pdo->exec($sql);
        $this->sendResponse(true, "Base de données initialisée");
    }

    private function saveProject()
    {
        if (!$this->pdo)
            throw new Exception("Connexion DB échouée");
        $input = $this->getRequestData();
        $id = $input['id'] ?? null;
        $name = $input['name'] ?? 'Projet sans titre';
        $description = $input['description'] ?? '';
        $config = json_encode($input['config']);

        if ($id) {
            $stmt = $this->pdo->prepare("UPDATE t_map_projects SET name = ?, description = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$name, $description, $config, $id]);
        } else {
            $stmt = $this->pdo->prepare("INSERT INTO t_map_projects (name, description, config) VALUES (?, ?, ?)");
            $stmt->execute([$name, $description, $config]);
            $id = $this->pdo->lastInsertId();
        }

        $this->sendResponse(true, "Projet enregistré", ['id' => $id]);
    }

    private function loadProjects()
    {
        if (!$this->pdo)
            throw new Exception("Connexion DB échouée");
        $stmt = $this->pdo->query("SELECT id, name, description, created_at, updated_at FROM t_map_projects ORDER BY updated_at DESC");
        $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $this->sendResponse(true, "Projets chargés", $projects);
    }

    private function getProject()
    {
        if (!$this->pdo)
            throw new Exception("Connexion DB échouée");
        $id = $_GET['id'] ?? null;
        if (!$id)
            throw new Exception("ID manquant");

        $stmt = $this->pdo->prepare("SELECT * FROM t_map_projects WHERE id = ?");
        $stmt->execute([$id]);
        $project = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($project) {
            $project['config'] = json_decode($project['config'], true);
            $this->sendResponse(true, "Projet récupéré", $project);
        } else {
            throw new Exception("Projet non trouvé");
        }
    }

    private function deleteProject()
    {
        if (!$this->pdo)
            throw new Exception("Connexion DB échouée");
        $input = $this->getRequestData();
        $id = $input['id'] ?? null;
        if (!$id)
            throw new Exception("ID manquant");

        $stmt = $this->pdo->prepare("DELETE FROM t_map_projects WHERE id = ?");
        $stmt->execute([$id]);
        $this->sendResponse(true, "Projet supprimé");
    }

    private function fetchAnalytics()
    {
        $this->loadDHIS2Config();
        $input = $this->getRequestData();

        $dx = $input['dx'] ?? ''; // Indicateurs/DataElements
        $pe = $input['pe'] ?? ''; // Périodes
        $ou = $input['ou'] ?? ''; // Unités d'organisation (LEVEL-x ou IDs)

        if (empty($dx) || empty($pe) || empty($ou)) {
            throw new Exception("Paramètres dx, pe et ou obligatoires");
        }

        $endpoint = "/api/analytics.json?dimension=dx:{$dx}&dimension=pe:{$pe}&dimension=ou:{$ou}&displayProperty=NAME&outputIdScheme=UID";
        $response = $this->makeRequest($endpoint, 'GET');

        $this->sendResponse(true, 'Analytiques récupérées', $response);
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

        $fields = 'id,displayName,name,geometry,path,organisationUnitGroups[id,displayName]';
        $parentEndpoint = "/api/organisationUnits/{$parentId}?fields={$fields}";
        $parentData = $this->makeRequest($parentEndpoint, 'GET');

        $organisationUnits = [];
        if ($includeDescendants) {
            $path = $parentData['path'];
            $endpoint = "/api/organisationUnits?fields={$fields}&filter=path:like:{$path}&paging=false";
            if (!empty($groupId))
                $endpoint .= "&filter=organisationUnitGroups.id:eq:{$groupId}";
            $response = $this->makeRequest($endpoint, 'GET');
            $organisationUnits = $response['organisationUnits'] ?? [];
        } else {
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
                if ($matchesGroup)
                    $organisationUnits = [$parentData];
            } else {
                $organisationUnits = [$parentData];
            }
        }

        $features = [];
        foreach ($organisationUnits as $ou) {
            if (isset($ou['geometry']) && !empty($ou['geometry']['coordinates'])) {
                $features[] = [
                    'id' => $ou['id'],
                    'name' => $ou['displayName'] ?? $ou['name'],
                    'geometry' => $ou['geometry'],
                    'groups' => array_map(function ($g) {
                        return $g['displayName'];
                    }, $ou['organisationUnitGroups'] ?? []),
                    'properties' => [
                        'id' => $ou['id'],
                        'name' => $ou['displayName'] ?? $ou['name']
                    ]
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
        if ($this->requestData !== null) {
            return $this->requestData;
        }

        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (strpos($contentType, 'application/json') !== false) {
            $rawInput = file_get_contents('php://input');
            $this->requestData = json_decode($rawInput, true);
        } else {
            $this->requestData = $_POST;
        }
        return $this->requestData;
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
            CURLOPT_SSL_VERIFYPEER => false, // Désactivé pour environnement local/test si besoin
            CURLOPT_SSL_VERIFYHOST => 0,
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
