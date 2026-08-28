<?php
/**
 * DHIS2 Proxy API
 * Gère les requêtes vers les instances DHIS2 avec gestion de session
 * Inspiré du pattern Node.js dhis2-session-manager
 */

// Configuration des headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Gérer les requêtes preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Activer l'affichage des erreurs pour le développement
error_reporting(E_ALL);
ini_set('display_errors', 0); // Ne pas afficher directement, on va logger
ini_set('log_errors', 1);

// Gestionnaire d'erreurs personnalisé
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

class DHIS2ProxyException extends Exception
{
    private $responseData;
    public function __construct($message, $code, $responseData = null)
    {
        parent::__construct($message, $code);
        $this->responseData = $responseData;
    }
    public function getResponseData()
    {
        return $this->responseData;
    }
}

/**
 * Classe de gestion de session DHIS2
 */
class DHIS2ProxyHandler
{
    private $dhis2Url;
    private $dhis2Endpoint;
    private $dhis2Method;
    private $dhis2Auth;
    private $dhis2Body;
    private $dhis2Headers;
    private $sessionCookie;

    public function __construct()
    {
        $this->sessionCookie = null;
    }

    /**
     * Traiter la requête principale
     */
    public function handleRequest()
    {
        try {
            // Lire les données de la requête
            $input = $this->getRequestData();

            // Valider les données requises
            $this->validateInput($input);

            // Extraire les paramètres
            $this->dhis2Url = rtrim($input['dhis2_url'], '/');
            $this->dhis2Endpoint = $input['dhis2_endpoint'];
            $this->dhis2Method = strtoupper($input['dhis2_method'] ?? 'GET');
            $this->dhis2Auth = $input['dhis2_auth'] ?? null;
            $this->dhis2Body = $input['dhis2_body'] ?? null;
            $this->dhis2Headers = isset($input['dhis2_headers']) ? json_decode($input['dhis2_headers'], true) : [];

            // Effectuer la requête vers DHIS2
            $response = $this->makeRequest();

            // Retourner la réponse
            $this->sendResponse(true, 'Requête réussie', $response);

        }
        catch (DHIS2ProxyException $e) {
            $this->sendResponse(false, $e->getMessage(), $e->getResponseData(), $e->getCode() ?: 500);
        }
        catch (Exception $e) {
            $this->sendResponse(false, $e->getMessage(), null, $e->getCode() ?: 500);
        }
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
     * Valider les données d'entrée
     */
    private function validateInput($input)
    {
        if (empty($input['dhis2_url'])) {
            throw new Exception('URL DHIS2 manquante');
        }

        if (empty($input['dhis2_endpoint'])) {
            throw new Exception('Endpoint DHIS2 manquant');
        }

        // Valider l'URL
        if (!filter_var($input['dhis2_url'], FILTER_VALIDATE_URL)) {
            throw new Exception('URL DHIS2 invalide');
        }
    }

    /**
     * Effectuer la requête vers DHIS2
     */
    private function makeRequest()
    {
        // Construire l'URL complète
        $fullUrl = $this->dhis2Url . $this->dhis2Endpoint;

        // Initialiser cURL
        $ch = curl_init();

        // Options communes
        $curlOptions = [
            CURLOPT_URL => $fullUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_UNRESTRICTED_AUTH => true, // Conserver l'auth lors des redirections entre hôtes (ex: play.dhis2.org -> play.im.dhis2.org)
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING => '', // Accepter toutes les encodages
            CURLOPT_HEADER => true, // Inclure les headers dans la réponse
        ];

        // Préparer les headers
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json'
        ];

        // Ajouter l'authentification
        if ($this->dhis2Auth) {
            $headers[] = 'Authorization: ' . $this->dhis2Auth;
        }

        // Ajouter les headers personnalisés
        if (!empty($this->dhis2Headers)) {
            foreach ($this->dhis2Headers as $key => $value) {
                $headers[] = "$key: $value";
            }
        }

        $curlOptions[CURLOPT_HTTPHEADER] = $headers;

        // Configurer la méthode HTTP
        switch ($this->dhis2Method) {
            case 'POST':
                $curlOptions[CURLOPT_POST] = true;
                if ($this->dhis2Body) {
                    $curlOptions[CURLOPT_POSTFIELDS] = $this->dhis2Body;
                }
                break;

            case 'PUT':
                $curlOptions[CURLOPT_CUSTOMREQUEST] = 'PUT';
                if ($this->dhis2Body) {
                    $curlOptions[CURLOPT_POSTFIELDS] = $this->dhis2Body;
                }
                break;

            case 'DELETE':
                $curlOptions[CURLOPT_CUSTOMREQUEST] = 'DELETE';
                break;

            case 'PATCH':
                $curlOptions[CURLOPT_CUSTOMREQUEST] = 'PATCH';
                if ($this->dhis2Body) {
                    $curlOptions[CURLOPT_POSTFIELDS] = $this->dhis2Body;
                }
                break;

            default: // GET
                $curlOptions[CURLOPT_HTTPGET] = true;
        }

        // Appliquer les options
        curl_setopt_array($ch, $curlOptions);

        // Debug: Logger la requête (à supprimer en production)
        error_log("=== DHIS2 Proxy Debug ===");
        error_log("URL: " . $fullUrl);
        error_log("Method: " . $this->dhis2Method);
        error_log("Auth Header: " . ($this->dhis2Auth ? "Present" : "Missing"));
        error_log("Headers: " . json_encode($headers));

        // Exécuter la requête
        $response = curl_exec($ch);

        // Vérifier les erreurs cURL
        if (curl_errno($ch)) {
            $error = curl_error($ch);
            throw new Exception("Erreur cURL: $error");
        }

        // Obtenir les informations de la requête
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);

        // Séparer headers et body
        $headerString = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);

        // Parser les headers pour extraire les cookies
        $this->extractCookies($headerString);

        // Décoder la réponse JSON
        $decodedBody = json_decode($body, true);

        // Si ce n'est pas du JSON valide, retourner le body brut
        if (json_last_error() !== JSON_ERROR_NONE) {
            $decodedBody = $body;
        }

        // Gérer les codes d'erreur HTTP
        if ($httpCode >= 400) {
            $errorMessage = $this->extractErrorMessage($decodedBody, $httpCode);

            // Ajouter l'URL complète pour le débogage
            error_log("DHIS2 Error {$httpCode}: {$errorMessage} - URL: {$fullUrl}");

            // Inclure l'URL dans le message pour les erreurs 404
            if ($httpCode === 404) {
                $errorMessage .= " - URL demandée: {$fullUrl}";
            }

            $exception = new DHIS2ProxyException($errorMessage, $httpCode, $decodedBody);
            throw $exception;
        }

        return [
            'status' => $httpCode,
            'data' => $decodedBody,
            'headers' => $this->parseHeaders($headerString)
        ];
    }

    /**
     * Extraire les cookies de session
     */
    private function extractCookies($headerString)
    {
        $headers = explode("\r\n", $headerString);

        foreach ($headers as $header) {
            if (stripos($header, 'Set-Cookie:') === 0) {
                $cookie = trim(substr($header, 11));
                $cookieParts = explode(';', $cookie);

                if (!empty($cookieParts[0])) {
                    $this->sessionCookie = $cookieParts[0];
                // On pourrait stocker le cookie en session PHP si nécessaire
                // $_SESSION['dhis2_cookie'] = $this->sessionCookie;
                }
            }
        }
    }

    /**
     * Parser les headers HTTP
     */
    private function parseHeaders($headerString)
    {
        $headers = [];
        $lines = explode("\r\n", $headerString);

        foreach ($lines as $line) {
            if (strpos($line, ':') !== false) {
                list($key, $value) = explode(':', $line, 2);
                $headers[trim($key)] = trim($value);
            }
        }

        return $headers;
    }

    /**
     * Extraire le message d'erreur de la réponse
     */
    private function extractErrorMessage($response, $httpCode)
    {
        // Si la réponse est un tableau/objet
        if (is_array($response)) {
            if (isset($response['message'])) {
                return $response['message'];
            }
            if (isset($response['error'])) {
                return is_string($response['error']) ? $response['error'] : json_encode($response['error']);
            }
            if (isset($response['status']) && isset($response['status']['description'])) {
                return $response['status']['description'];
            }
        }

        // Messages par défaut selon le code HTTP
        $defaultMessages = [
            400 => 'Requête invalide',
            401 => 'Non autorisé - Vérifiez vos identifiants',
            403 => 'Accès interdit',
            404 => 'Ressource non trouvée',
            500 => 'Erreur serveur DHIS2',
            502 => 'Passerelle invalide',
            503 => 'Service DHIS2 indisponible'
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
            'timestamp' => date('Y-m-d H:i:s'),
            'status' => $httpCode
        ];

        if ($data !== null) {
            $response['data'] = $data;
        }

        echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }
}

// Point d'entrée principal
try {
    $handler = new DHIS2ProxyHandler();
    $handler->handleRequest();
}
catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'timestamp' => date('Y-m-d H:i:s'),
        'status' => 500
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}