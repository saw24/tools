/**
 * DHIS2 Session Manager
 * Gère les sessions DHIS2 avec authentification et gestion des cookies
 * Inspiré du pattern Node.js mais adapté pour le frontend
 */

class DHIS2SessionManager {
    constructor() {
        this.isAuthenticated = false;
        this.sessionCookie = null;
        this.config = null;

        // Utiliser un chemin absolu depuis la racine du site
        // Fonctionne depuis n'importe quelle page du projet
        this.apiBaseUrl = 'api/dhis2-proxy.php';
        console.log('🔧 DHIS2 Proxy URL:', this.apiBaseUrl);
    }

    /**
     * Initialiser la session avec les credentials
     * @param {string} url - URL de l'instance DHIS2
     * @param {string} username - Nom d'utilisateur
     * @param {string} password - Mot de passe
     */
    async initialize(url, username, password) {
        // Formater l'URL
        let formattedUrl = url.trim();
        if (!formattedUrl.startsWith('http')) {
            formattedUrl = 'https://' + formattedUrl;
        }
        formattedUrl = formattedUrl.replace(/\/$/, '');

        // Créer la configuration
        this.config = {
            url: formattedUrl,
            username: username,
            authHeader: 'Basic ' + btoa(username + ':' + password),
            connectedAt: new Date().toISOString()
        };

        // Sauvegarder en session storage
        sessionStorage.setItem('dhis2_config', JSON.stringify(this.config));

        return this.config;
    }

    /**
     * Obtenir la configuration actuelle
     */
    getConfig() {
        if (!this.config) {
            const stored = sessionStorage.getItem('dhis2_config');
            if (stored) {
                this.config = JSON.parse(stored);
            }
        }
        return this.config;
    }

    /**
     * Vérifier si l'utilisateur est authentifié
     */
    isConnected() {
        return this.getConfig() !== null;
    }

    /**
     * Effectuer une requête vers DHIS2 via le proxy PHP
     * @param {string} endpoint - Endpoint DHIS2 (ex: '/api/me')
     * @param {object} options - Options de la requête (method, body, etc.)
     */
    async request(endpoint, options = {}) {
        const config = this.getConfig();

        if (!config) {
            throw new Error('Non connecté à DHIS2. Veuillez vous authentifier d\'abord.');
        }

        // Préparer les paramètres de la requête
        const requestData = {
            dhis2_url: config.url,
            dhis2_endpoint: endpoint,
            dhis2_method: options.method || 'GET',
            dhis2_auth: config.authHeader
        };

        // Ajouter le body si présent
        if (options.body) {
            requestData.dhis2_body = JSON.stringify(options.body);
        }

        // Ajouter les headers personnalisés
        if (options.headers) {
            requestData.dhis2_headers = JSON.stringify(options.headers);
        }

        try {
            const response = await $.ajax({
                url: this.apiBaseUrl,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(requestData),
                dataType: 'json'
            });

            if (!response.success) {
                throw new Error(response.message || 'Erreur lors de la requête DHIS2');
            }

            // Le proxy retourne { success, message, data: { status, data, headers } }
            // On veut juste le contenu DHIS2 qui est dans response.data.data
            return response.data.data || response.data;
        } catch (error) {
            // Gérer l'erreur 401 (non autorisé)
            if (error.status === 401 || (error.responseJSON && error.responseJSON.status === 401)) {
                console.warn('⚠️ Session DHIS2 expirée ou credentials invalides');
                this.logout();
                throw new Error('Session expirée. Veuillez vous reconnecter.');
            }

            if (error.responseJSON) {
                const proxyError = new Error(error.responseJSON.message || 'Erreur de proxy');
                proxyError.data = error.responseJSON.data;
                proxyError.status = error.responseJSON.status;
                throw proxyError;
            }

            throw error;
        }
    }

    /**
     * Raccourci pour GET
     */
    async get(endpoint, params = {}) {
        let url = endpoint;

        // Ajouter les paramètres de requête
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (endpoint.includes('?') ? '&' : '?') + queryString;
        }

        return this.request(url, { method: 'GET' });
    }

    /**
     * Raccourci pour POST
     */
    async post(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: body
        });
    }

    /**
     * Raccourci pour PUT
     */
    async put(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: body
        });
    }

    /**
     * Raccourci pour DELETE
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    /**
     * Tester la connexion à DHIS2
     */
    async testConnection() {
        try {
            const userData = await this.get('/api/me');
            console.log(`✅ Connecté à DHIS2 en tant que: ${userData.username || userData.name}`);
            this.isAuthenticated = true;
            return {
                success: true,
                user: userData
            };
        } catch (error) {
            console.error('❌ Échec de connexion à DHIS2:', error.message);
            this.isAuthenticated = false;
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtenir les informations de l'utilisateur connecté
     */
    async getCurrentUser() {
        return this.get('/api/me');
    }

    /**
     * Obtenir les informations système
     */
    async getSystemInfo() {
        return this.get('/api/system/info');
    }

    /**
     * Déconnexion
     */
    logout() {
        this.isAuthenticated = false;
        this.sessionCookie = null;
        this.config = null;
        sessionStorage.removeItem('dhis2_config');
        console.log('🔒 Session DHIS2 fermée');
    }

    /**
     * Obtenir les métadonnées (data elements, indicators, etc.)
     */
    async getMetadata(type, params = {}) {
        const defaultParams = {
            fields: 'id,name,displayName,code',
            paging: false,
            ...params
        };

        return this.get(`/api/${type}`, defaultParams);
    }

    /**
     * Obtenir les organisation units
     */
    async getOrganisationUnits(params = {}) {
        return this.getMetadata('organisationUnits', params);
    }

    /**
     * Obtenir les data elements
     */
    async getDataElements(params = {}) {
        return this.getMetadata('dataElements', params);
    }

    /**
     * Obtenir les indicators
     */
    async getIndicators(params = {}) {
        return this.getMetadata('indicators', params);
    }

    /**
     * Obtenir les data sets
     */
    async getDataSets(params = {}) {
        return this.getMetadata('dataSets', params);
    }

    /**
     * Obtenir les valeurs de données
     */
    async getDataValues(params = {}) {
        return this.get('/api/dataValueSets', params);
    }

    /**
     * Envoyer des valeurs de données
     */
    async postDataValues(dataValueSet) {
        return this.post('/api/dataValueSets', dataValueSet);
    }
}

// Créer et exporter une instance singleton
const dhis2Session = new DHIS2SessionManager();

// Exposer globalement pour faciliter l'accès
window.dhis2Session = dhis2Session;
