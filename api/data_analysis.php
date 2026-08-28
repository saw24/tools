<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Error handling
ini_set('display_errors', 0);
error_reporting(E_ALL);

function sendError($message)
{
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function sendSuccess($data)
{
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    sendError('Invalid JSON input');
}

$action = $input['action'] ?? '';
$dbConfig = $input['dbConfig'] ?? [];

if (empty($dbConfig)) {
    sendError('Missing database configuration');
}

// Helper to get PDO connection
function getPDO($config)
{
    $type = $config['type'];
    $host = $config['host'];
    $port = $config['port'];
    $name = $config['name'];
    $user = $config['user'];
    $pass = $config['password'];

    try {
        if ($type === 'postgresql') {
            $dsn = "pgsql:host=$host;port=$port;dbname=$name";
        } else { // mysql
            $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
        }

        $pdo = new PDO($dsn, $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        sendError("Connection failed: " . $e->getMessage());
    }
}

try {
    $pdo = getPDO($dbConfig);

    switch ($action) {
        case 'connect':
            // List tables
            if ($dbConfig['type'] === 'postgresql') {
                $stmt = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
                $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
            } else { // mysql
                $stmt = $pdo->query("SHOW TABLES");
                $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }
            sendSuccess(['tables' => $tables]);
            break;

        case 'get_columns':
            $table = $input['table'] ?? '';
            if (!$table)
                sendError('Table name required');

            // Basic sanitization
            $table = preg_replace('/[^a-zA-Z0-9_]/', '', $table);

            if ($dbConfig['type'] === 'postgresql') {
                $stmt = $pdo->prepare("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?");
                $stmt->execute([$table]);
                $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
            } else {
                $stmt = $pdo->query("DESCRIBE `$table`");
                $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }
            sendSuccess(['columns' => $columns]);
            break;

        case 'query':
            $table = $input['table'] ?? '';
            if (!$table)
                sendError('Table required');

            // Sanitize table name (very basic)
            $table = preg_replace('/[^a-zA-Z0-9_]/', '', $table);

            $columns = $input['columns'] ?? [];
            $columnList = '*';

            if (!empty($columns) && is_array($columns)) {
                $sanitizedCols = [];
                foreach ($columns as $col) {
                    $sanitizedCol = preg_replace('/[^a-zA-Z0-9_]/', '', $col);
                    if ($sanitizedCol) {
                        $sanitizedCols[] = ($dbConfig['type'] === 'postgresql' ? '"' . $sanitizedCol . '"' : "`$sanitizedCol`");
                    }
                }
                if (!empty($sanitizedCols)) {
                    $columnList = implode(', ', $sanitizedCols);
                }
            }

            $where = $input['where'] ?? '';
            $orderBy = $input['orderBy'] ?? '';
            $orderDir = $input['orderDir'] ?? 'ASC';
            $limit = intval($input['limit'] ?? 100);

            $sql = "SELECT $columnList FROM " . ($dbConfig['type'] === 'postgresql' ? '"' . $table . '"' : "`$table`");

            // Add WHERE (DANGEROUS: assumes user knows SQL and we trust them in this tool context)
            // Ideally we should parse this, but for a generic tool, we might have to execute raw WHERE.
            if (!empty($where)) {
                $sql .= " WHERE " . $where;
            }

            if (!empty($orderBy)) {
                // Sanitize column name
                $orderBy = preg_replace('/[^a-zA-Z0-9_]/', '', $orderBy);
                if ($orderDir !== 'ASC' && $orderDir !== 'DESC')
                    $orderDir = 'ASC';
                $sql .= " ORDER BY " . ($dbConfig['type'] === 'postgresql' ? '"' . $orderBy . '"' : "`$orderBy`") . " $orderDir";
            }

            $sql .= " LIMIT $limit";

            try {
                $stmt = $pdo->query($sql);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                sendSuccess(['rows' => $data]);
            } catch (PDOException $e) {
                sendError("Query failed: " . $e->getMessage());
            }
            break;

        default:
            sendError('Invalid action');
    }
} catch (Exception $e) {
    sendError($e->getMessage());
}
