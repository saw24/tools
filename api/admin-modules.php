<?php
/**
 * API d'administration du catalogue de modules (t_modules), utilisée par
 * admin/stats.html pour l'ajout, la modification et la suppression des modules
 * suivis par les Statistiques d'Utilisation, sans avoir à éditer de code.
 *
 * Protégée par un jeton partagé (ADMIN_TOKEN dans le .env), envoyé par le
 * frontend via l'en-tête `Authorization: Bearer <jeton>`. Tant que ADMIN_TOKEN
 * n'est pas défini, toutes les actions sont refusées (échec fermé par défaut).
 *
 * Le catalogue « de référence » versionné dans le code (api/module_catalog.php,
 * utilisé par ?action=init) n'est pas modifié par cette API : les deux
 * cohabitent. Voir MODULE_STATISTIQUES.md pour la différence d'usage entre les
 * deux (changement rapide via l'admin vs. changement versionné dans le code).
 */

header('Content-Type: application/json');
require_once __DIR__ . '/db_stats.php';

/**
 * Vérifie le jeton administrateur envoyé via l'en-tête Authorization: Bearer.
 * Termine la requête avec une réponse JSON d'erreur si absent/invalide.
 */
function requireAdminToken()
{
    $configured = envGet('ADMIN_TOKEN', '');
    if ($configured === '') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => "Interface d'administration désactivée : définissez ADMIN_TOKEN dans votre fichier .env (voir MODULE_STATISTIQUES.md)."
        ]);
        exit;
    }

    $authHeader = '';
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $authHeader = $value;
                break;
            }
        }
    }
    if ($authHeader === '' && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }

    $provided = '';
    if (stripos($authHeader, 'Bearer ') === 0) {
        $provided = trim(substr($authHeader, 7));
    }

    if ($provided === '' || !hash_equals($configured, $provided)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Jeton administrateur invalide ou manquant.']);
        exit;
    }
}

requireAdminToken();

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

$pdo = getStatsDB();
if (!$pdo) {
    $diag = getStatsDBDiagnostic();
    echo json_encode([
        'success' => false,
        'message' => 'Impossible de se connecter à la base de données.',
        'diagnostic' => $diag
    ]);
    exit;
}

/**
 * Chemin de module valide : un simple nom de fichier .html, sans séparateur de
 * répertoire ni séquence de traversée — pour rester cohérent avec la structure
 * de l'application (toutes les pages sont à la racine du dossier servi).
 */
function isValidModulePath($path)
{
    return (bool) preg_match('/^[A-Za-z0-9_-]+\.html$/', $path);
}

function isDuplicateKeyError(PDOException $e)
{
    $msg = strtolower($e->getMessage());
    return strpos($msg, 'unique') !== false || strpos($msg, 'duplicate') !== false;
}

if ($action === 'list') {
    $stmt = $pdo->query("
        SELECT
            m.id, m.module_path, m.module_name, m.category, m.icon_class,
            m.is_active, m.created_at,
            COALESCE(v.visit_count, 0) AS visit_count,
            v.last_visit
        FROM t_modules m
        LEFT JOIN (
            SELECT module_id, COUNT(*) AS visit_count, MAX(visited_at) AS last_visit
            FROM t_module_visits
            GROUP BY module_id
        ) v ON v.module_id = m.id
        ORDER BY m.module_name ASC
    ");
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
}

if ($action === 'create') {
    $path = trim($input['module_path'] ?? '');
    $name = trim($input['module_name'] ?? '');
    $category = trim($input['category'] ?? '') ?: 'Autre';
    $icon = trim($input['icon_class'] ?? '') ?: 'fa-cube';

    if (!isValidModulePath($path)) {
        echo json_encode(['success' => false, 'message' => "Chemin invalide (attendu : un-fichier.html, sans '/' ni '..')."]);
        exit;
    }
    if ($name === '') {
        echo json_encode(['success' => false, 'message' => 'Le nom du module est requis.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO t_modules (module_path, module_name, category, icon_class) VALUES (?, ?, ?, ?)");
        $stmt->execute([$path, $name, $category, $icon]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode([
            'success' => false,
            'message' => isDuplicateKeyError($e) ? 'Ce chemin de module existe déjà.' : $e->getMessage()
        ]);
    }
    exit;
}

if ($action === 'update') {
    $id = intval($input['id'] ?? 0);
    $path = trim($input['module_path'] ?? '');
    $name = trim($input['module_name'] ?? '');
    $category = trim($input['category'] ?? '') ?: 'Autre';
    $icon = trim($input['icon_class'] ?? '') ?: 'fa-cube';
    $isActive = !empty($input['is_active']) ? 'true' : 'false';

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Identifiant de module invalide.']);
        exit;
    }
    if (!isValidModulePath($path)) {
        echo json_encode(['success' => false, 'message' => "Chemin invalide (attendu : un-fichier.html, sans '/' ni '..')."]);
        exit;
    }
    if ($name === '') {
        echo json_encode(['success' => false, 'message' => 'Le nom du module est requis.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            UPDATE t_modules
            SET module_path = ?, module_name = ?, category = ?, icon_class = ?, is_active = ?
            WHERE id = ?
        ");
        $stmt->execute([$path, $name, $category, $icon, $isActive, $id]);
        echo json_encode(['success' => true, 'updated' => $stmt->rowCount() > 0]);
    } catch (PDOException $e) {
        echo json_encode([
            'success' => false,
            'message' => isDuplicateKeyError($e) ? 'Ce chemin de module existe déjà pour un autre module.' : $e->getMessage()
        ]);
    }
    exit;
}

// Suppression : `hard=false` (défaut) désactive juste le module (réversible, conserve
// l'historique des visites) ; `hard=true` supprime définitivement la ligne et,
// par cascade, tout son historique de visites (t_module_visits.module_id
// référence t_modules.id ON DELETE CASCADE).
if ($action === 'delete') {
    $id = intval($input['id'] ?? 0);
    $hard = !empty($input['hard']);

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Identifiant de module invalide.']);
        exit;
    }

    try {
        if ($hard) {
            $pdo->prepare("DELETE FROM t_modules WHERE id = ?")->execute([$id]);
        } else {
            $pdo->prepare("UPDATE t_modules SET is_active = FALSE WHERE id = ?")->execute([$id]);
        }
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['success' => false, 'message' => 'Action non reconnue']);
