# Documentation API DHIS2 Backend

## Vue d'ensemble

Ce backend fournit une interface pour se connecter et interagir avec les instances DHIS2. Il est composé de deux parties principales :

1. **Frontend (JavaScript)** : Gestionnaire de session et module d'authentification
2. **Backend (PHP)** : Proxy API pour les requêtes DHIS2

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   (Browser)     │
└────────┬────────┘
         │
         │ AJAX Request
         ▼
┌─────────────────┐
│  dhis2-session- │
│   manager.js    │
└────────┬────────┘
         │
         │ HTTP POST
         ▼
┌─────────────────┐
│ dhis2-proxy.php │
└────────┬────────┘
         │
         │ cURL
         ▼
┌─────────────────┐
│  DHIS2 Server   │
└─────────────────┘
```

## Composants

### 1. dhis2-session-manager.js

Gestionnaire de session côté client qui facilite les interactions avec DHIS2.

#### Initialisation

```javascript
// Initialiser la connexion
await dhis2Session.initialize(url, username, password);

// Tester la connexion
const result = await dhis2Session.testConnection();
if (result.success) {
    console.log('Connecté en tant que:', result.user.username);
}
```

#### Méthodes principales

##### GET Request
```javascript
// Obtenir les informations de l'utilisateur
const user = await dhis2Session.getCurrentUser();

// Obtenir des métadonnées avec paramètres
const dataElements = await dhis2Session.get('/api/dataElements', {
    fields: 'id,name,displayName',
    filter: 'domainType:eq:AGGREGATE',
    paging: false
});
```

##### POST Request
```javascript
// Envoyer des données
const dataValueSet = {
    dataValues: [
        {
            dataElement: 'fbfJHSPpUQD',
            period: '202301',
            orgUnit: 'DiszpKrYNg8',
            value: '100'
        }
    ]
};

const result = await dhis2Session.postDataValues(dataValueSet);
```

##### PUT Request
```javascript
// Mettre à jour une ressource
const updatedData = {
    name: 'Nouveau nom',
    displayName: 'Nouveau nom affiché'
};

await dhis2Session.put('/api/dataElements/fbfJHSPpUQD', updatedData);
```

##### DELETE Request
```javascript
// Supprimer une ressource
await dhis2Session.delete('/api/dataElements/fbfJHSPpUQD');
```

#### Méthodes utilitaires

```javascript
// Obtenir les organisation units
const orgUnits = await dhis2Session.getOrganisationUnits({
    fields: 'id,name,level',
    level: 3
});

// Obtenir les data elements
const dataElements = await dhis2Session.getDataElements({
    filter: 'domainType:eq:AGGREGATE'
});

// Obtenir les indicators
const indicators = await dhis2Session.getIndicators();

// Obtenir les data sets
const dataSets = await dhis2Session.getDataSets();

// Obtenir les valeurs de données
const dataValues = await dhis2Session.getDataValues({
    dataSet: 'pBOMPrpg1QX',
    orgUnit: 'DiszpKrYNg8',
    period: '202301'
});

// Obtenir les informations système
const systemInfo = await dhis2Session.getSystemInfo();
```

#### Gestion de session

```javascript
// Vérifier si connecté
if (dhis2Session.isConnected()) {
    console.log('Session active');
}

// Obtenir la configuration actuelle
const config = dhis2Session.getConfig();
console.log('URL:', config.url);
console.log('Username:', config.username);

// Se déconnecter
dhis2Session.logout();
```

#### Événements personnalisés

```javascript
// Écouter la connexion
$(document).on('dhis2:connected', function(event, user) {
    console.log('Utilisateur connecté:', user);
});

// Écouter la déconnexion
$(document).on('dhis2:disconnected', function() {
    console.log('Utilisateur déconnecté');
});
```

### 2. dhis2-proxy.php

Proxy backend qui gère les requêtes vers DHIS2.

#### Format de requête

**Endpoint:** `/api/dhis2-proxy.php`

**Méthode:** POST

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
    "dhis2_url": "https://play.dhis2.org/2.40.0",
    "dhis2_endpoint": "/api/me",
    "dhis2_method": "GET",
    "dhis2_auth": "Basic YWRtaW46ZGlzdHJpY3Q=",
    "dhis2_body": null,
    "dhis2_headers": null
}
```

#### Format de réponse

**Succès:**
```json
{
    "success": true,
    "message": "Requête réussie",
    "timestamp": "2025-12-05 08:30:00",
    "status": 200,
    "data": {
        "status": 200,
        "data": {
            "id": "M5zQapPyTZI",
            "username": "admin",
            "displayName": "Admin User"
        },
        "headers": {
            "Content-Type": "application/json"
        }
    }
}
```

**Erreur:**
```json
{
    "success": false,
    "message": "Non autorisé - Vérifiez vos identifiants",
    "timestamp": "2025-12-05 08:30:00",
    "status": 401
}
```

### 3. dhis2-auth.js

Module d'authentification avec interface utilisateur.

#### Fonctionnalités

- Modal de connexion
- Validation des credentials
- Affichage du statut de connexion
- Gestion de la déconnexion
- Feedback utilisateur (toasts)

#### Utilisation

Le module s'initialise automatiquement au chargement de la page :

```javascript
$(document).ready(function () {
    initDHIS2Auth();
});
```

## Exemples d'utilisation

### Exemple 1 : Récupérer les data elements

```javascript
async function loadDataElements() {
    try {
        const response = await dhis2Session.getDataElements({
            fields: 'id,name,displayName,valueType,domainType',
            filter: 'domainType:eq:AGGREGATE',
            pageSize: 50
        });
        
        console.log('Data Elements:', response.dataElements);
        return response.dataElements;
    } catch (error) {
        console.error('Erreur:', error);
        showToast('error', 'Erreur', 'Impossible de charger les data elements');
    }
}
```

### Exemple 2 : Importer des données

```javascript
async function importData() {
    try {
        const dataValueSet = {
            dataValues: [
                {
                    dataElement: 'fbfJHSPpUQD',
                    period: '202301',
                    orgUnit: 'DiszpKrYNg8',
                    categoryOptionCombo: 'HllvX50cXC0',
                    value: '120'
                },
                {
                    dataElement: 'cYeuwXTCPkU',
                    period: '202301',
                    orgUnit: 'DiszpKrYNg8',
                    categoryOptionCombo: 'HllvX50cXC0',
                    value: '250'
                }
            ]
        };
        
        const result = await dhis2Session.postDataValues(dataValueSet);
        
        if (result.data.status === 'SUCCESS') {
            showToast('success', 'Succès', 'Données importées avec succès');
        } else {
            showToast('warning', 'Attention', 'Import partiel');
        }
        
        return result;
    } catch (error) {
        console.error('Erreur:', error);
        showToast('error', 'Erreur', 'Échec de l\'import');
    }
}
```

### Exemple 3 : Récupérer l'arbre organisationnel

```javascript
async function loadOrgUnitTree() {
    try {
        const response = await dhis2Session.get('/api/organisationUnits', {
            fields: 'id,name,level,children[id,name,level]',
            filter: 'level:eq:1',
            paging: false
        });
        
        console.log('Organisation Units:', response.organisationUnits);
        return response.organisationUnits;
    } catch (error) {
        console.error('Erreur:', error);
    }
}
```

### Exemple 4 : Recherche avec filtres

```javascript
async function searchDataElements(searchTerm) {
    try {
        const response = await dhis2Session.getDataElements({
            fields: 'id,name,displayName,code',
            filter: `name:ilike:${searchTerm}`,
            pageSize: 20
        });
        
        return response.dataElements;
    } catch (error) {
        console.error('Erreur de recherche:', error);
        return [];
    }
}
```

## Gestion des erreurs

Le système gère automatiquement plusieurs types d'erreurs :

### Erreurs d'authentification (401)
```javascript
try {
    await dhis2Session.get('/api/me');
} catch (error) {
    if (error.status === 401) {
        // L'utilisateur sera automatiquement déconnecté
        // et devra se reconnecter
        showToast('error', 'Session expirée', 'Veuillez vous reconnecter');
    }
}
```

### Erreurs réseau
```javascript
try {
    await dhis2Session.get('/api/dataElements');
} catch (error) {
    if (error.message.includes('cURL')) {
        showToast('error', 'Erreur réseau', 'Impossible de contacter le serveur DHIS2');
    }
}
```

### Erreurs de validation
```javascript
try {
    await dhis2Session.postDataValues(invalidData);
} catch (error) {
    if (error.status === 400) {
        showToast('error', 'Données invalides', error.message);
    }
}
```

## Sécurité

### Bonnes pratiques

1. **Ne jamais stocker les mots de passe** : Seul le header d'authentification encodé est stocké en session
2. **Utiliser HTTPS** : Toujours se connecter à des instances DHIS2 en HTTPS
3. **Validation côté serveur** : Le proxy PHP valide toutes les entrées
4. **Timeout** : Les requêtes ont un timeout de 30 secondes
5. **Session storage** : Les credentials sont stockés uniquement en session (effacés à la fermeture du navigateur)

### Configuration SSL

Le proxy PHP vérifie les certificats SSL par défaut. Pour désactiver en développement (non recommandé en production) :

```php
// Dans dhis2-proxy.php
CURLOPT_SSL_VERIFYPEER => false, // Désactiver la vérification SSL
```

## Performance

### Cache

Pour améliorer les performances, vous pouvez implémenter un cache côté client :

```javascript
class CachedDHIS2Session extends DHIS2SessionManager {
    constructor() {
        super();
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }
    
    async get(endpoint, params = {}) {
        const cacheKey = endpoint + JSON.stringify(params);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        
        const data = await super.get(endpoint, params);
        this.cache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });
        
        return data;
    }
}
```

## Débogage

### Activer les logs

```javascript
// Dans la console du navigateur
dhis2Session.debug = true;

// Les requêtes seront loggées
await dhis2Session.get('/api/me');
// Console: [DHIS2] GET /api/me
// Console: [DHIS2] Response: {...}
```

### Inspecter la configuration

```javascript
// Voir la configuration actuelle
console.log(dhis2Session.getConfig());

// Voir si connecté
console.log('Connecté:', dhis2Session.isConnected());
```

## Support

Pour plus d'informations sur l'API DHIS2, consultez :
- [Documentation officielle DHIS2](https://docs.dhis2.org/)
- [API Reference](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/web-api.html)
