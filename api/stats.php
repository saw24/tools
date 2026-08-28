<?php
header('Content-Type: application/json');
require_once 'db_stats.php';

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

$pdo = getStatsDB();

if (!$pdo) {
    echo json_encode(['success' => false, 'message' => 'Impossible de se connecter à la base de données de statistiques']);
    exit;
}

// Initialisation de la base de données si nécessaire
if ($action === 'init') {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS t_module_stats (
                id SERIAL PRIMARY KEY,
                module_name VARCHAR(255) NOT NULL,
                module_path VARCHAR(255) NOT NULL,
                visit_count INTEGER DEFAULT 1,
                last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(module_path)
            );
        ");
        echo json_encode(['success' => true, 'message' => 'Base de données initialisée']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// Enregistrer une visite
if ($action === 'track_visit') {
    $moduleName = $input['moduleName'] ?? '';
    $modulePath = $input['modulePath'] ?? '';

    if (empty($moduleName) || empty($modulePath)) {
        echo json_encode(['success' => false, 'message' => 'Données manquantes']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO t_module_stats (module_name, module_path, visit_count, last_visit)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT (module_path) 
            DO UPDATE SET 
                visit_count = t_module_stats.visit_count + 1,
                last_visit = CURRENT_TIMESTAMP,
                module_name = EXCLUDED.module_name
        ");
        $stmt->execute([$moduleName, $modulePath]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// Récupérer les statistiques
if ($action === 'get_stats') {
    try {
        $stmt = $pdo->query("SELECT * FROM t_module_stats ORDER BY visit_count DESC");
        $stats = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $stats]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['success' => false, 'message' => 'Action non reconnue']);
