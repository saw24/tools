<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db_stats.php';
require_once __DIR__ . '/module_catalog.php';

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

$pdo = getStatsDB();

if (!$pdo) {
    $diag = getStatsDBDiagnostic();
    echo json_encode([
        'success' => false,
        'message' => 'Impossible de se connecter à la base de données de statistiques. '
            . 'Fichier .env : ' . $diag['env_file_path'] . ' ('
            . ($diag['env_file_found'] ? 'trouvé' : 'INTROUVABLE') . '). '
            . 'Vérifiez ce fichier et les identifiants PostgreSQL (voir MODULE_STATISTIQUES.md).',
        'diagnostic' => $diag
    ]);
    exit;
}

/**
 * (Re)synchronise la table t_modules avec le catalogue canonique (module_catalog.php).
 * N'écrase jamais la catégorie d'un module déjà en base (elle peut être personnalisée
 * manuellement), seulement son nom affiché et son icône.
 */
function seedModuleCatalog(PDO $pdo)
{
    $stmt = $pdo->prepare("
        INSERT INTO t_modules (module_path, module_name, category, icon_class)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (module_path) DO UPDATE SET
            module_name = EXCLUDED.module_name,
            icon_class = EXCLUDED.icon_class
    ");
    $count = 0;
    foreach (dhis2ToolsModuleCatalog() as $mod) {
        $stmt->execute([$mod['path'], $mod['name'], $mod['category'], $mod['icon']]);
        $count++;
    }
    return $count;
}

// Initialisation / mise à jour du schéma + du catalogue de modules.
// Idempotent : peut être rappelé à tout moment (ex: après l'ajout d'un nouveau
// module dans module_catalog.php) pour resynchroniser la base sans rien casser.
if ($action === 'init') {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS t_modules (
                id SERIAL PRIMARY KEY,
                module_path VARCHAR(255) NOT NULL UNIQUE,
                module_name VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL DEFAULT 'Autre',
                icon_class VARCHAR(100),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS t_module_visits (
                id BIGSERIAL PRIMARY KEY,
                module_id INTEGER NOT NULL REFERENCES t_modules(id) ON DELETE CASCADE,
                visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        ");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_module_visits_module_id ON t_module_visits (module_id);");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_module_visits_visited_at ON t_module_visits (visited_at DESC);");

        $seeded = seedModuleCatalog($pdo);

        echo json_encode(['success' => true, 'message' => "Base de données initialisée ({$seeded} module(s) catalogués)"]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// Enregistrer une visite. Le module est créé à la volée dans t_modules s'il n'y
// figure pas déjà (ex: module non encore présent dans module_catalog.php), avec la
// catégorie par défaut 'Autre' — visible immédiatement dans les statistiques.
if ($action === 'track_visit') {
    $moduleName = trim($input['moduleName'] ?? '');
    $modulePath = trim($input['modulePath'] ?? '');

    if ($moduleName === '' || $modulePath === '') {
        echo json_encode(['success' => false, 'message' => 'Données manquantes']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO t_modules (module_path, module_name)
            VALUES (?, ?)
            ON CONFLICT (module_path) DO UPDATE SET module_name = EXCLUDED.module_name
            RETURNING id
        ");
        $stmt->execute([$modulePath, $moduleName]);
        $moduleId = $stmt->fetchColumn();

        $pdo->prepare("INSERT INTO t_module_visits (module_id) VALUES (?)")->execute([$moduleId]);

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// Statistiques agrégées par module — inclut TOUS les modules actifs du catalogue,
// y compris ceux jamais visités (visit_count = 0), grâce au LEFT JOIN.
if ($action === 'get_stats') {
    try {
        $stmt = $pdo->query("
            SELECT
                m.id,
                m.module_path,
                m.module_name,
                m.category,
                m.icon_class,
                COALESCE(v.visit_count, 0) AS visit_count,
                v.last_visit
            FROM t_modules m
            LEFT JOIN (
                SELECT module_id, COUNT(*) AS visit_count, MAX(visited_at) AS last_visit
                FROM t_module_visits
                GROUP BY module_id
            ) v ON v.module_id = m.id
            WHERE m.is_active = TRUE
            ORDER BY visit_count DESC, m.module_name ASC
        ");
        $stats = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $stats]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// Série temporelle des visites (toutes pages confondues), pour le graphique
// d'activité du tableau de bord. ?days=14 (défaut), borné entre 1 et 90.
if ($action === 'get_visits_timeseries') {
    $days = isset($_GET['days']) ? max(1, min(90, intval($_GET['days']))) : 14;

    try {
        $stmt = $pdo->query("
            SELECT date_trunc('day', visited_at)::date AS day, COUNT(*) AS count
            FROM t_module_visits
            WHERE visited_at >= (CURRENT_DATE - INTERVAL '" . ($days - 1) . " days')
            GROUP BY day
            ORDER BY day
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Compléter les jours sans visite avec 0, pour un graphique continu
        $byDay = [];
        foreach ($rows as $r) {
            $byDay[$r['day']] = (int) $r['count'];
        }
        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-{$i} day"));
            $series[] = ['day' => $d, 'count' => $byDay[$d] ?? 0];
        }

        echo json_encode(['success' => true, 'data' => $series]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['success' => false, 'message' => 'Action non reconnue']);
