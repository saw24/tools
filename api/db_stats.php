<?php
// Connexion PostgreSQL pour les statistiques d'utilisation (et les commentaires/
// notifications qui partagent la même base). Les identifiants ne sont JAMAIS codés
// en dur ici : ils sont lus depuis un fichier .env externe au dossier servi.
// Voir api/env.php pour la résolution du chemin (DHIS2_TOOLS_ENV_PATH ou repli par
// défaut) et MODULE_STATISTIQUES.md pour la procédure de déploiement complète.
require_once __DIR__ . '/env.php';

define('DB_HOST', envGet('DB_HOST', '127.0.0.1'));
define('DB_PORT', envGet('DB_PORT', '5432'));
define('DB_NAME', envGet('DB_NAME', 'dhis2_tools'));
define('DB_USER', envGet('DB_USER', 'postgres'));
define('DB_PASS', envGet('DB_PASS', ''));

/**
 * Retourne une instance de PDO pour PostgreSQL, ou null si la connexion échoue
 * (fichier .env manquant, identifiants invalides, serveur PostgreSQL injoignable...).
 */
function getStatsDB()
{
    try {
        $dsn = "pgsql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
        $pdo = new PDO($dsn, DB_USER, DB_PASS);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (PDOException $e) {
        // En production, logger l'erreur au lieu de l'afficher
        error_log("Stats DB Error: " . $e->getMessage());
        return null;
    }
}

/**
 * Informations de diagnostic (sans le mot de passe) utilisées pour renvoyer un
 * message d'erreur explicite quand getStatsDB() échoue, afin de faciliter le
 * dépannage d'un premier déploiement (.env introuvable, mauvais identifiants...).
 */
function getStatsDBDiagnostic()
{
    $envInfo = loadEnvFile();
    return array(
        'env_file_path' => $envInfo['path'],
        'env_file_found' => $envInfo['found'],
        'db_host' => DB_HOST,
        'db_port' => DB_PORT,
        'db_name' => DB_NAME,
        'db_user' => DB_USER,
    );
}
