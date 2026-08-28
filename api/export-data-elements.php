<?php
/**
 * API Module: Export Data Elements
 * Endpoint dédié pour l'export des éléments de données
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
 * Classe pour gérer l'export des éléments de données
 */
class DataElementsExportAPI
{
    private $dhis2Url;
    private $dhis2Auth;

    /**
     * Point d'entrée principal
     */
    public function handleRequest()
    {
        try {
            $action = $_GET['action'] ?? 'list';

            switch ($action) {
                case 'list':
                    $this->listDataSets();
                    break;

                case 'export':
                    $this->exportDataElements();
                    break;

                default:
                    throw new Exception('Action non reconnue');
            }
        } catch (Exception $e) {
            $this->sendResponse(false, $e->getMessage(), null, 500);
        }
    }

    /**
     * Lister les ensembles de données
     */
    private function listDataSets()
    {
        $this->loadDHIS2Config();

        $endpoint = '/api/dataSets?fields=id,displayName,periodType,created,lastUpdated&paging=false';
        $response = $this->makeRequest($endpoint, 'GET');

        $this->sendResponse(true, 'Ensembles de données récupérés', $response);
    }

    /**
     * Exporter les éléments de données d'un ensemble
     */
    private function exportDataElements()
    {
        $this->loadDHIS2Config();

        $dataSetId = $_GET['dataSetId'] ?? null;
        if (!$dataSetId) {
            throw new Exception('ID de l\'ensemble de données manquant');
        }

        $endpoint = "/api/dataSets/{$dataSetId}?fields=id,displayName,dataSetElements[dataElement[id,displayName,code,valueType,domainType,categoryCombo[id,displayName]]]";
        $response = $this->makeRequest($endpoint, 'GET');

        $this->sendResponse(true, 'Éléments de données récupérés', $response);
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
    $api = new DataElementsExportAPI();
    $api->handleRequest();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
