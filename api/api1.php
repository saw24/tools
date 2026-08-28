<?php
/**
 * Excel Mapping API - Backend PHP
 * Handles server-side operations for Excel mapping
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Error handling
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

// Main router
try {
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    
    switch ($action) {
        case 'upload':
            handleFileUpload();
            break;
            
        case 'process':
            handleProcessMapping();
            break;
            
        case 'export':
            handleExport();
            break;
            
        case 'save':
            handleSaveMapping();
            break;
            
        case 'load':
            handleLoadMapping();
            break;
            
        default:
            sendResponse(false, 'Action non valide', null, 400);
    }
} catch (Exception $e) {
    sendResponse(false, $e->getMessage(), null, 500);
}

/**
 * Handle file upload
 */
function handleFileUpload() {
    if (!isset($_FILES['file'])) {
        sendResponse(false, 'Aucun fichier téléchargé');
    }
    
    $file = $_FILES['file'];
    
    // Validate file
    $allowedExtensions = ['xlsx', 'xls', 'csv'];
    $fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    if (!in_array($fileExtension, $allowedExtensions)) {
        sendResponse(false, 'Format de fichier non valide');
    }
    
    // Create uploads directory if not exists
    $uploadDir = __DIR__ . '/uploads/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    
    // Generate unique filename
    $filename = uniqid('excel_') . '.' . $fileExtension;
    $filepath = $uploadDir . $filename;
    
    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        sendResponse(true, 'Fichier téléchargé avec succès', [
            'filename' => $filename,
            'filepath' => $filepath,
            'size' => $file['size'],
            'originalName' => $file['name']
        ]);
    } else {
        sendResponse(false, 'Erreur lors du téléchargement du fichier');
    }
}

/**
 * Handle mapping processing (if needed server-side)
 */
function handleProcessMapping() {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['sourceValues']) || !isset($input['targetValues'])) {
        sendResponse(false, 'Données manquantes');
    }
    
    $sourceValues = $input['sourceValues'];
    $targetValues = $input['targetValues'];
    
    $results = [];
    
    foreach ($sourceValues as $sourceVal) {
        $bestMatch = '';
        $bestScore = 0;
        
        foreach ($targetValues as $targetVal) {
            $score = calculateSimilarity($sourceVal, $targetVal);
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestMatch = $targetVal;
            }
        }
        
        $results[] = [
            'source' => $sourceVal,
            'target' => $bestMatch,
            'score' => $bestScore,
            'manual' => false
        ];
    }
    
    sendResponse(true, 'Mapping effectué avec succès', $results);
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function calculateSimilarity($str1, $str2) {
    $str1 = mb_strtolower($str1, 'UTF-8');
    $str2 = mb_strtolower($str2, 'UTF-8');
    
    $distance = levenshtein($str1, $str2);
    $maxLength = max(mb_strlen($str1), mb_strlen($str2));
    
    if ($maxLength === 0) {
        return 1.0;
    }
    
    return ($maxLength - $distance) / $maxLength;
}

/**
 * Handle export request
 */
function handleExport() {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['mappings'])) {
        sendResponse(false, 'Données de mapping manquantes');
    }
    
    $mappings = $input['mappings'];
    $sourceSheet = $input['sourceSheet'] ?? 'Source';
    $targetSheet = $input['targetSheet'] ?? 'Target';
    $sourceCol = $input['sourceCol'] ?? 'Source Column';
    $targetCol = $input['targetCol'] ?? 'Target Column';
    
    // Create CSV content
    $csv = [];
    $csv[] = [
        "Source: $sourceSheet - $sourceCol",
        "Mapped: $targetSheet - $targetCol",
        'Confidence Score',
        'Status'
    ];
    
    foreach ($mappings as $mapping) {
        $csv[] = [
            $mapping['source'],
            $mapping['target'],
            round($mapping['score'] * 100) . '%',
            $mapping['manual'] ? 'Manuel' : 'Automatique'
        ];
    }
    
    // Generate CSV file
    $filename = 'mapping_' . date('Y-m-d_H-i-s') . '.csv';
    $filepath = __DIR__ . '/exports/' . $filename;
    
    // Create exports directory if not exists
    if (!file_exists(__DIR__ . '/exports/')) {
        mkdir(__DIR__ . '/exports/', 0777, true);
    }
    
    $fp = fopen($filepath, 'w');
    foreach ($csv as $row) {
        fputcsv($fp, $row);
    }
    fclose($fp);
    
    sendResponse(true, 'Export créé avec succès', [
        'filename' => $filename,
        'filepath' => $filepath,
        'downloadUrl' => 'exports/' . $filename
    ]);
}

/**
 * Save mapping configuration
 */
function handleSaveMapping() {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['name']) || !isset($input['config'])) {
        sendResponse(false, 'Données manquantes');
    }
    
    $name = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['name']);
    $config = $input['config'];
    
    // Create saved mappings directory
    $saveDir = __DIR__ . '/saved_mappings/';
    if (!file_exists($saveDir)) {
        mkdir($saveDir, 0777, true);
    }
    
    $filename = $name . '_' . time() . '.json';
    $filepath = $saveDir . $filename;
    
    if (file_put_contents($filepath, json_encode($config, JSON_PRETTY_PRINT))) {
        sendResponse(true, 'Configuration sauvegardée', [
            'filename' => $filename,
            'filepath' => $filepath
        ]);
    } else {
        sendResponse(false, 'Erreur lors de la sauvegarde');
    }
}

/**
 * Load saved mapping configuration
 */
function handleLoadMapping() {
    $filename = $_GET['filename'] ?? '';
    
    if (empty($filename)) {
        sendResponse(false, 'Nom de fichier manquant');
    }
    
    $filepath = __DIR__ . '/saved_mappings/' . basename($filename);
    
    if (!file_exists($filepath)) {
        sendResponse(false, 'Configuration non trouvée');
    }
    
    $config = json_decode(file_get_contents($filepath), true);
    
    if ($config === null) {
        sendResponse(false, 'Erreur lors de la lecture de la configuration');
    }
    
    sendResponse(true, 'Configuration chargée', $config);
}

/**
 * Send JSON response
 */
function sendResponse($success, $message, $data = null, $httpCode = 200) {
    http_response_code($httpCode);
    
    $response = [
        'success' => $success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ];
    
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit();
}

/**
 * Clean old files (can be called via cron)
 */
function cleanOldFiles($directory, $maxAge = 86400) {
    if (!file_exists($directory)) {
        return;
    }
    
    $files = glob($directory . '*');
    $now = time();
    
    foreach ($files as $file) {
        if (is_file($file)) {
            if ($now - filemtime($file) >= $maxAge) {
                unlink($file);
            }
        }
    }
}

// Optional: Clean old uploads (older than 24 hours)
if (isset($_GET['cleanup']) && $_GET['cleanup'] === 'true') {
    cleanOldFiles(__DIR__ . '/uploads/', 86400);
    cleanOldFiles(__DIR__ . '/exports/', 86400);
    sendResponse(true, 'Nettoyage effectué');
}
