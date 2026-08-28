<?php
// Configuration de la base de données PostgreSQL pour les statistiques
define('DB_HOST', 'localhost');
define('DB_PORT', '5432');
define('DB_NAME', 'dhis2_tools');
define('DB_USER', 'saw24');
define('DB_PASS', 'saw24');

/**
 * Retourne une instance de PDO pour PostgreSQL
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
