<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db_stats.php';

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

$pdo = getStatsDB();

if (!$pdo) {
    $diag = getStatsDBDiagnostic();
    echo json_encode([
        'success' => false,
        'message' => 'Impossible de se connecter à la base de données. Fichier .env : '
            . $diag['env_file_path'] . ' (' . ($diag['env_file_found'] ? 'trouvé' : 'INTROUVABLE') . ').',
        'diagnostic' => $diag
    ]);
    exit;
}

// Initialisation de la base de données
if ($action === 'init') {
    try {
        // Table des commentaires (déjà existante, on ajoute rating si besoin)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS t_module_comments (
                id SERIAL PRIMARY KEY,
                module_path TEXT NOT NULL,
                user_name TEXT DEFAULT 'Anonyme',
                comment_text TEXT,
                rating INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // Tenter d'ajouter la colonne rating si elle n'existe pas
        try {
            $pdo->exec("ALTER TABLE t_module_comments ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 0");
        } catch (Exception $e) {
            // La colonne existe probablement déjà
        }

        // Table des notifications
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS t_module_notifications (
                id SERIAL PRIMARY KEY,
                module_path TEXT,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ");

        echo json_encode(['success' => true, 'message' => 'Base de données initialisée']);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

switch ($action) {
    case 'add_comment':
        $modulePath = $input['modulePath'] ?? '';
        $userName = $input['userName'] ?? 'Anonyme';
        $commentText = $input['commentText'] ?? '';
        $rating = intval($input['rating'] ?? 0);

        if (empty($modulePath)) {
            echo json_encode(['success' => false, 'message' => 'Module non spécifié']);
            exit;
        }

        if (empty($commentText) && $rating === 0) {
            echo json_encode(['success' => false, 'message' => 'Veuillez laisser un commentaire ou une note']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO t_module_comments (module_path, user_name, comment_text, rating) VALUES (?, ?, ?, ?)");
            $stmt->execute([$modulePath, $userName, $commentText, $rating]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'get_comments':
        $modulePath = $_GET['modulePath'] ?? '';
        if (empty($modulePath)) {
            echo json_encode(['success' => false, 'message' => 'Module non spécifié']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT * FROM t_module_comments WHERE module_path = ? ORDER BY created_at DESC");
            $stmt->execute([$modulePath]);
            $comments = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $comments]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'get_rating_stats':
        $modulePath = $_GET['modulePath'] ?? '';
        if (empty($modulePath)) {
            echo json_encode(['success' => false, 'message' => 'Module non spécifié']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                SELECT 
                    COUNT(*) as total_count,
                    COALESCE(AVG(NULLIF(rating, 0)), 0) as average_rating,
                    COUNT(NULLIF(rating, 0)) as rating_count
                FROM t_module_comments 
                WHERE module_path = ?
            ");
            $stmt->execute([$modulePath]);
            $stats = $stmt->fetch(PDO::FETCH_ASSOC);

            // On s'assure que les types sont corrects
            $stats['average_rating'] = round(floatval($stats['average_rating']), 1);
            $stats['total_count'] = intval($stats['total_count']);
            $stats['rating_count'] = intval($stats['rating_count']);

            echo json_encode(['success' => true, 'data' => $stats]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'get_all_ratings':
        try {
            $stmt = $pdo->query("
                SELECT 
                    module_path,
                    COALESCE(AVG(NULLIF(rating, 0)), 0) as average_rating,
                    COUNT(NULLIF(rating, 0)) as rating_count
                FROM t_module_comments 
                GROUP BY module_path
            ");
            $ratings = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // On formate les données
            foreach ($ratings as &$r) {
                $r['average_rating'] = round(floatval($r['average_rating']), 1);
                $r['rating_count'] = intval($r['rating_count']);
            }

            echo json_encode(['success' => true, 'data' => $ratings]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'get_notifications':
        $modulePath = $_GET['modulePath'] ?? null;
        try {
            if ($modulePath) {
                $stmt = $pdo->prepare("SELECT * FROM t_module_notifications WHERE (module_path = ? OR module_path IS NULL) AND is_active = TRUE ORDER BY created_at DESC");
                $stmt->execute([$modulePath]);
            } else {
                $stmt = $pdo->query("SELECT * FROM t_module_notifications WHERE is_active = TRUE ORDER BY created_at DESC");
            }
            $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $notifications]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Action non reconnue']);
}
