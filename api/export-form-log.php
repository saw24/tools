<?php
/**
 * API Module: Read form export debug log
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$requestId = $_GET['requestId'] ?? '';
$requestId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $requestId);

if ($requestId === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'requestId est requis',
        'lines' => []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit();
}

$logFile = dirname(__DIR__) . '/exports/form-export-' . substr($requestId, 0, 80) . '.log';
if (!is_file($logFile)) {
    echo json_encode([
        'success' => true,
        'message' => 'Journal pas encore créé',
        'lines' => []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit();
}

$content = file_get_contents($logFile);
$lines = array_values(array_filter(preg_split('/\R/', $content), function ($line) {
    return trim($line) !== '';
}));

echo json_encode([
    'success' => true,
    'message' => 'Journal lu',
    'requestId' => $requestId,
    'lines' => $lines,
    'updatedAt' => date('Y-m-d H:i:s', filemtime($logFile))
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
