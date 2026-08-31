<?php
/**
 * Chargeur .env minimaliste (sans dépendance Composer), compatible PHP 7.4+.
 *
 * Le fichier .env RÉEL doit être stocké HORS du dossier servi par le serveur web
 * (ex: en dehors du DocumentRoot), afin qu'il ne soit jamais accessible via une URL.
 * `.env.example` à la racine du dépôt n'est qu'un modèle : ne le remplissez jamais
 * avec de vraies valeurs à cet endroit.
 *
 * Résolution du chemin, du plus simple au plus avancé (le premier trouvé l'emporte) :
 *   1. La constante DHIS2_TOOLS_ENV_PATH ci-dessous : éditez directement cette
 *      ligne avec le chemin absolu de votre fichier .env réel. C'est la manière
 *      la plus simple pour démarrer — aucune configuration serveur nécessaire.
 *   2. À défaut (constante laissée à ''), la variable d'environnement système du
 *      même nom, positionnée par le serveur (Apache: `SetEnv DHIS2_TOOLS_ENV_PATH
 *      /etc/dhis2-tools/.env` ; php-fpm pool: `env[DHIS2_TOOLS_ENV_PATH] = ...` ;
 *      ou `export` avant un `php -S`). Pratique en production, mais à réserver
 *      pour plus tard : de nombreux SAPI (php-fpm en tête, avec `clear_env=yes`
 *      par défaut) ne transmettent PAS automatiquement les variables shell/Apache
 *      à PHP tant que ce n'est pas explicitement configuré.
 *   3. À défaut des deux, un fichier `dhis2-tools.env` situé UN niveau au-dessus
 *      de la racine de l'application (donc hors du DocumentRoot si celui-ci
 *      pointe pile sur ce dossier cloné).
 */

// ↓↓↓ ÉDITEZ CETTE LIGNE pour un démarrage simple : indiquez le chemin absolu de
// votre fichier .env réel, situé HORS du dossier servi par le serveur web
// (ex: '/etc/dhis2-tools/.env' ou '/Users/moi/dhis2-tools.env').
// Laissez '' pour passer par une variable d'environnement système à la place
// (voir MODULE_STATISTIQUES.md).
define('DHIS2_TOOLS_ENV_PATH', '/Users/saw24/mes_fichiers_env/tools/.env');

/**
 * getenv() enveloppée : certains pools PHP-FPM durcis désactivent getenv()/putenv()
 * via disable_functions (rarement getenv, mais on reste défensif par cohérence).
 * Renvoie false si la fonction est indisponible, comme le ferait getenv() en échec.
 */
function safeGetenv($key)
{
    if (!function_exists('getenv')) {
        return false;
    }
    return @getenv($key);
}

/**
 * Chemin absolu du fichier .env réellement utilisé.
 */
function dhis2ToolsEnvPath()
{
    if (DHIS2_TOOLS_ENV_PATH !== '') {
        return DHIS2_TOOLS_ENV_PATH;
    }

    $fromEnv = safeGetenv('DHIS2_TOOLS_ENV_PATH');
    if ($fromEnv) {
        return $fromEnv;
    }

    // __DIR__ = .../tools/api  ->  racine app = .../tools  ->  un niveau au-dessus
    $appRoot = dirname(__DIR__);
    $parentDir = dirname($appRoot);

    return $parentDir . DIRECTORY_SEPARATOR . 'dhis2-tools.env';
}

/**
 * Parse le fichier .env et renvoie ['path' => ..., 'found' => bool, 'values' => []].
 * Les valeurs trouvées sont aussi injectées via putenv() (sauf si la variable existe
 * déjà dans l'environnement système, qui reste toujours prioritaire).
 * Le résultat est mis en cache pour la durée de la requête PHP.
 */
function loadEnvFile()
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $path = dhis2ToolsEnvPath();
    $values = array();
    $found = is_readable($path);

    if ($found) {
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (strpos($line, '=') === false) {
                continue;
            }

            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);

            // Retirer les guillemets englobants éventuels ("valeur" ou 'valeur')
            $len = strlen($value);
            if ($len >= 2 && (
                ($value[0] === '"' && $value[$len - 1] === '"') ||
                ($value[0] === "'" && $value[$len - 1] === "'")
            )) {
                $value = substr($value, 1, -1);
            }

            $values[$key] = $value;

            // putenv() est fréquemment désactivée sur les pools PHP-FPM durcis
            // (elle peut faire fuiter des variables entre requêtes réutilisant le
            // même worker) alors qu'elle reste active en CLI — d'où un
            // comportement qui diffère entre `php -S`/CLI et un vrai déploiement
            // FPM. On la rend donc optionnelle : envGet() n'en dépend pas, elle
            // ne sert qu'à exposer aussi les valeurs via getenv() pour du code tiers.
            if (function_exists('putenv') && safeGetenv($key) === false) {
                @putenv($key . '=' . $value);
            }
        }
    }

    $cache = array('path' => $path, 'found' => $found, 'values' => $values);
    return $cache;
}

/**
 * Lit une variable de configuration : priorité à une vraie variable d'environnement
 * système (utile en conteneur/Docker/CI), puis au fichier .env chargé, puis à la
 * valeur par défaut fournie.
 */
function envGet($key, $default = null)
{
    $systemValue = safeGetenv($key);
    if ($systemValue !== false && $systemValue !== '') {
        return $systemValue;
    }

    $loaded = loadEnvFile();
    return isset($loaded['values'][$key]) ? $loaded['values'][$key] : $default;
}
