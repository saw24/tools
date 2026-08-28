<?php
/**
 * Optional AI-assisted mapping proxy.
 *
 * Supports local Ollama and OpenAI-compatible chat APIs. The frontend sends
 * prefiltered candidates only; the model must choose one of those candidates.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendResponse(false, 'Méthode non autorisée', null, 405);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        sendResponse(false, 'JSON invalide', null, 400);
    }

    $provider = strtolower(trim($input['provider'] ?? 'ollama'));
    $model = trim($input['model'] ?? '');
    $baseUrl = rtrim(trim($input['baseUrl'] ?? ''), '/');
    $token = trim($input['token'] ?? '');
    $rows = $input['rows'] ?? [];
    $temperature = isset($input['temperature']) ? (float) $input['temperature'] : 0.1;

    if ($model === '') {
        sendResponse(false, 'Modèle IA manquant', null, 400);
    }
    if (!is_array($rows) || count($rows) === 0) {
        sendResponse(false, 'Aucune ligne à mapper', null, 400);
    }
    if (count($rows) > 50) {
        sendResponse(false, 'Lot trop volumineux: 50 lignes maximum par appel', null, 400);
    }

    $baseUrl = $baseUrl ?: ($provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com');
    $messages = buildMessages($rows);

    if ($provider === 'ollama') {
        $content = callOllama($baseUrl, $model, $messages, $temperature);
    } else {
        if ($token === '') {
            sendResponse(false, 'Token API requis pour ce provider', null, 400);
        }
        $content = callOpenAiCompatible($baseUrl, $model, $token, $messages, $temperature);
    }

    $mappings = parseMappings($content);
    $mappings = validateMappings($mappings, $rows);

    sendResponse(true, 'Mapping IA généré', ['mappings' => $mappings]);
} catch (Throwable $e) {
    sendResponse(false, $e->getMessage(), null, 500);
}

function buildMessages(array $rows): array
{
    $system = 'Tu aides à faire un mapping de valeurs Excel. Réponds uniquement en JSON valide. Pour chaque source, choisis la meilleure target uniquement parmi candidates.value. Si aucune candidate ne convient, mets target à une chaîne vide et score à 0. Le score doit être ta confiance sémantique entre 0 et 1, pas une copie du score candidat local.';
    $user = [
        'task' => 'Retourne {"mappings":[{"source":"...","target":"...","score":0.0,"reason":"..."}]}',
        'rules' => [
            'Ne crée jamais une target absente des candidates.',
            'Favorise les synonymes, acronymes, abréviations, accents et variations de formulation.',
            'Si un acronyme ou synonyme est évident, utilise un score élevé, par exemple 0.85 à 0.98.',
            'La reason doit être courte.'
        ],
        'rows' => $rows
    ];

    return [
        ['role' => 'system', 'content' => $system],
        ['role' => 'user', 'content' => json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
    ];
}

function callOllama(string $baseUrl, string $model, array $messages, float $temperature): string
{
    $payload = [
        'model' => $model,
        'messages' => $messages,
        'stream' => false,
        'format' => 'json',
        'options' => [
            'temperature' => $temperature
        ]
    ];

    $response = httpPostJson($baseUrl . '/api/chat', $payload, []);
    $decoded = json_decode($response, true);
    $content = $decoded['message']['content'] ?? '';

    if ($content === '') {
        throw new RuntimeException('Réponse Ollama vide ou invalide');
    }

    return $content;
}

function callOpenAiCompatible(string $baseUrl, string $model, string $token, array $messages, float $temperature): string
{
    $payload = [
        'model' => $model,
        'messages' => $messages,
        'temperature' => $temperature,
        'response_format' => ['type' => 'json_object']
    ];

    $response = httpPostJson($baseUrl . '/v1/chat/completions', $payload, [
        'Authorization: Bearer ' . $token
    ]);
    $decoded = json_decode($response, true);
    $content = $decoded['choices'][0]['message']['content'] ?? '';

    if ($content === '') {
        throw new RuntimeException('Réponse provider IA vide ou invalide');
    }

    return $content;
}

function httpPostJson(string $url, array $payload, array $headers): string
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('Extension PHP cURL indisponible');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 120
    ]);

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    if ($response === false || $status >= 400) {
        $message = $error ?: ('HTTP ' . $status . ' depuis ' . $url);
        throw new RuntimeException($message);
    }

    return $response;
}

function parseMappings(string $content): array
{
    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        if (preg_match('/\{.*\}/s', $content, $matches)) {
            $decoded = json_decode($matches[0], true);
        }
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Le modèle IA n\'a pas retourné un JSON exploitable');
    }

    if (isset($decoded['mappings']) && is_array($decoded['mappings'])) {
        return $decoded['mappings'];
    }

    if (isset($decoded['mapping']) && is_array($decoded['mapping'])) {
        return $decoded['mapping'];
    }

    if (isset($decoded['results']) && is_array($decoded['results'])) {
        return $decoded['results'];
    }

    if (isset($decoded['matches']) && is_array($decoded['matches'])) {
        return $decoded['matches'];
    }

    if (isset($decoded['source']) && array_key_exists('target', $decoded)) {
        return [$decoded];
    }

    if (isListArray($decoded)) {
        return $decoded;
    }

    $associativeMappings = [];
    foreach ($decoded as $source => $target) {
        if (is_string($source) && (is_string($target) || is_numeric($target) || $target === null)) {
            $associativeMappings[] = [
                'source' => $source,
                'target' => (string) $target,
                'score' => $target ? 0.8 : 0,
                'reason' => 'Format simplifié'
            ];
        }
    }

    if ($associativeMappings) {
        return $associativeMappings;
    }

    throw new RuntimeException('Structure JSON IA invalide: ' . substr(json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 300));
}

function isListArray(array $array): bool
{
    if ($array === []) {
        return true;
    }

    return array_keys($array) === range(0, count($array) - 1);
}

function validateMappings(array $mappings, array $rows): array
{
    $allowedBySource = [];
    foreach ($rows as $row) {
        $source = (string) ($row['source'] ?? '');
        $allowedBySource[$source] = [];
        foreach (($row['candidates'] ?? []) as $candidate) {
            $value = (string) ($candidate['value'] ?? '');
            if ($value !== '') {
                $allowedBySource[$source][$value] = true;
            }
        }
    }

    $validated = [];
    foreach ($mappings as $mapping) {
        $source = (string) ($mapping['source'] ?? '');
        $target = (string) ($mapping['target'] ?? '');
        $score = isset($mapping['score']) ? (float) $mapping['score'] : 0;

        if (!array_key_exists($source, $allowedBySource)) {
            continue;
        }
        if ($target !== '' && !isset($allowedBySource[$source][$target])) {
            $target = '';
            $score = 0;
        }

        $validated[] = [
            'source' => $source,
            'target' => $target,
            'score' => max(0, min(1, $score)),
            'reason' => trim((string) ($mapping['reason'] ?? ''))
        ];
    }

    return $validated;
}

function sendResponse(bool $success, string $message, $data = null, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}
