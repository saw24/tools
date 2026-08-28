/**
 * Excel Mapping - Configuration
 * Personnalisez les paramètres de l'application ici
 */

const CONFIG = {
    // Pagination
    itemsPerPage: 20,

    // Scores de confiance (seuils)
    scoreThresholds: {
        high: 0.8,    // > 80% = haute confiance (vert)
        medium: 0.5   // > 50% = moyenne confiance (orange)
        // <= 50% = faible confiance (rouge)
    },

    // Algorithme de matching
    matching: {
        caseSensitive: false,        // Ignorer la casse
        trimWhitespace: true,        // Supprimer les espaces
        normalizeAccents: true,      // Normaliser les accents
        minAcceptedScore: 0.45       // En dessous, laisser "Non mappé"
    },

    // Mapping IA optionnel
    aiMapping: {
        enabled: false,                              // Active une passe IA après le matching local
        provider: 'ollama',                          // 'ollama' ou provider compatible OpenAI
        model: 'llama3.1:8b',                        // Exemple Ollama: llama3.1:8b, mistral, qwen2.5
        baseUrl: 'http://localhost:11434',           // Ollama local ou URL du provider compatible
        token: '',                                   // Requis pour les providers distants
        apiUrl: 'api/ai-mapping.php',
        maxRows: 200,                                // Limite de valeurs sources envoyées à l'IA
        candidateLimit: 12,                          // Nombre de candidats préfiltrés par valeur source
        minBaselineScore: 0.92,                      // Les scores >= à ce seuil ne sont pas réinterrogés
        batchSize: 25,
        temperature: 0.1
    },

    // Fichiers
    files: {
        maxSize: 50 * 1024 * 1024,  // 50 MB
        allowedExtensions: ['xlsx', 'xls', 'csv'],
        uploadDirectory: 'uploads/',
        exportDirectory: 'exports/'
    },

    // Interface utilisateur
    ui: {
        animationDuration: 300,      // ms
        toastDuration: 4000,         // ms
        progressUpdateInterval: 50,  // ms
        searchDebounce: 300          // ms
    },

    // Couleurs (peut être modifié pour correspondre à votre charte graphique)
    colors: {
        primary: '#6366f1',
        secondary: '#ec4899',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6'
    },

    // Textes (pour internationalisation future)
    texts: {
        fr: {
            uploadTitle: 'Importer votre fichier',
            uploadSubtitle: 'Glissez-déposez votre fichier Excel ici',
            mapButton: 'Lancer le Mapping Intelligent',
            exportButton: 'Exporter en Excel',
            noMatch: 'Aucune correspondance',
            processing: 'Analyse en cours...',
            success: 'Succès',
            error: 'Erreur'
        }
    },

    // API (si backend PHP utilisé)
    api: {
        baseUrl: 'api/api1.php',
        timeout: 30000,  // ms
        retries: 3
    },

    // Fonctionnalités
    features: {
        enableBackendProcessing: false,  // Utiliser le backend PHP pour le mapping
        enableSaveMapping: true,         // Permettre la sauvegarde des configurations
        enableAutoSave: false,           // Sauvegarde automatique
        enableHistory: false,            // Historique des mappings
        enableExportPDF: false           // Export en PDF (à implémenter)
    },

    // Debug
    debug: {
        enabled: false,                  // Mode debug
        logLevel: 'info',               // 'error', 'warn', 'info', 'debug'
        showPerformance: false          // Afficher les métriques de performance
    }
};

// Fonction pour obtenir une valeur de configuration
function getConfig(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], CONFIG);
}

// Fonction pour définir une valeur de configuration
function setConfig(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, CONFIG);
    target[lastKey] = value;
}

// Logger personnalisé basé sur la configuration
const Logger = {
    error: (...args) => {
        if (CONFIG.debug.enabled) console.error('[ERROR]', ...args);
    },
    warn: (...args) => {
        if (CONFIG.debug.enabled && ['warn', 'info', 'debug'].includes(CONFIG.debug.logLevel)) {
            console.warn('[WARN]', ...args);
        }
    },
    info: (...args) => {
        if (CONFIG.debug.enabled && ['info', 'debug'].includes(CONFIG.debug.logLevel)) {
            console.info('[INFO]', ...args);
        }
    },
    debug: (...args) => {
        if (CONFIG.debug.enabled && CONFIG.debug.logLevel === 'debug') {
            console.log('[DEBUG]', ...args);
        }
    }
};

// Exporter pour utilisation dans app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, getConfig, setConfig, Logger };
}
