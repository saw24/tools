# 🔍 Guide de Débogage - Erreur 404 DHIS2

## 📋 Problème

Le proxy PHP répond correctement (HTTP 200), mais retourne une erreur 404 de DHIS2 :
```json
{
    "success": false,
    "message": "Ressource non trouvée",
    "timestamp": "2025-12-05 10:16:57",
    "status": 404
}
```

## 🎯 Diagnostic

### 1. Vérifier les logs PHP

Les logs sont dans `/Applications/MAMP/logs/php_error.log`

```bash
tail -f /Applications/MAMP/logs/php_error.log
```

Cherchez ces lignes :
```
=== DHIS2 Proxy Debug ===
URL: https://...
Method: GET
Auth Header: Present
Headers: [...]
DHIS2 Error 404: Ressource non trouvée - URL: https://...
```

### 2. Vérifier l'URL DHIS2

L'erreur 404 signifie que l'URL ou l'endpoint DHIS2 est incorrect.

**Causes possibles :**

#### A. URL de base incorrecte
```javascript
// ❌ Mauvais
url: 'play.dhis2.org/2.40.0'

// ✅ Correct
url: 'https://play.dhis2.org/2.40.0'
```

#### B. Endpoint incorrect
```javascript
// ❌ Mauvais
/api/me/

// ✅ Correct
/api/me
```

#### C. Version DHIS2 incorrecte
```javascript
// ❌ Mauvais (version n'existe pas)
https://play.dhis2.org/2.99.0

// ✅ Correct
https://play.dhis2.org/2.40.0
```

### 3. Tester manuellement l'URL

Ouvrez votre navigateur et testez :
```
https://play.dhis2.org/2.40.0/api/me
```

Vous devriez voir une demande d'authentification ou une réponse JSON.

## 🔧 Solutions

### Solution 1 : Vérifier l'URL dans le modal de connexion

1. Ouvrez le modal de connexion
2. Vérifiez l'URL saisie
3. Format attendu : `https://play.dhis2.org/2.40.0` (sans `/` à la fin)

### Solution 2 : Vérifier dans la console du navigateur

```javascript
// Dans la console
const config = JSON.parse(sessionStorage.getItem('dhis2_config'));
console.log('URL DHIS2:', config.url);
console.log('Endpoint:', '/api/me');
console.log('URL complète:', config.url + '/api/me');
```

### Solution 3 : Tester avec curl

```bash
curl -u "admin:district" "https://play.dhis2.org/2.40.0/api/me"
```

Si cela fonctionne, le problème vient de votre configuration.

### Solution 4 : Vérifier le code de testConnection

Dans `dhis2-session-manager.js` :
```javascript
async testConnection() {
    try {
        const userData = await this.get('/api/me');
        // ...
    }
}
```

L'endpoint `/api/me` doit exister sur votre instance DHIS2.

## 📊 Checklist de débogage

- [ ] Vérifier les logs PHP (`tail -f /Applications/MAMP/logs/php_error.log`)
- [ ] Vérifier l'URL complète dans les logs
- [ ] Tester l'URL manuellement dans le navigateur
- [ ] Vérifier le format de l'URL (avec `https://`, sans `/` final)
- [ ] Vérifier que l'endpoint `/api/me` existe
- [ ] Tester avec curl
- [ ] Vérifier la version DHIS2
- [ ] Vérifier les credentials

## 🎯 Messages d'erreur améliorés

Avec la dernière modification, les erreurs 404 incluent maintenant l'URL complète :

```json
{
    "success": false,
    "message": "Ressource non trouvée - URL demandée: https://play.dhis2.org/2.40.0/api/me",
    "timestamp": "2025-12-05 10:16:57",
    "status": 404
}
```

Cela vous permet de voir exactement quelle URL est appelée.

## 🔍 Exemples d'URLs correctes

### DHIS2 Play (démo)
```
https://play.dhis2.org/2.40.0
https://play.dhis2.org/2.39.1
https://play.dhis2.org/dev
```

### DHIS2 Production (exemple)
```
https://dhis2.example.org
https://hmis.example.org
```

### Endpoints communs
```
/api/me                    # Infos utilisateur
/api/system/info          # Infos système
/api/dataSets             # Ensembles de données
/api/dataElements         # Éléments de données
/api/organisationUnits    # Unités d'organisation
```

## 🆘 Si le problème persiste

### 1. Activer les logs détaillés

Dans `dhis2-session-manager.js`, ajoutez :
```javascript
async request(endpoint, options = {}) {
    console.log('🔍 Request:', {
        endpoint,
        method: options.method || 'GET',
        url: this.config.url + endpoint
    });
    
    // ... reste du code
}
```

### 2. Vérifier la réponse brute

Dans `dhis2-proxy.php`, ajoutez avant la ligne 215 :
```php
error_log("Raw response: " . substr($body, 0, 500));
```

### 3. Tester avec Postman

1. Créez une requête POST vers `http://localhost:8888/saw-dhis2-tools/api/dhis2-proxy.php`
2. Body (JSON) :
```json
{
    "dhis2_url": "https://play.dhis2.org/2.40.0",
    "dhis2_endpoint": "/api/me",
    "dhis2_method": "GET",
    "dhis2_auth": "Basic YWRtaW46ZGlzdHJpY3Q="
}
```
3. Regardez la réponse

## ✅ Résolution typique

**Problème** : URL mal formatée
```javascript
// ❌ Avant
url: 'play.dhis2.org/2.40.0/'

// ✅ Après
url: 'https://play.dhis2.org/2.40.0'
```

**Problème** : Endpoint incorrect
```javascript
// ❌ Avant
endpoint: '/api/me/'

// ✅ Après
endpoint: '/api/me'
```

**Problème** : Version inexistante
```javascript
// ❌ Avant
url: 'https://play.dhis2.org/2.50.0'

// ✅ Après (vérifier les versions disponibles)
url: 'https://play.dhis2.org/2.40.0'
```

## 📝 Prochaines étapes

1. **Vérifiez les logs** pour voir l'URL exacte appelée
2. **Testez l'URL** manuellement dans le navigateur
3. **Corrigez** l'URL ou l'endpoint si nécessaire
4. **Réessayez** la connexion

---

**Note** : Avec les améliorations apportées, le message d'erreur inclut maintenant l'URL complète, ce qui facilite grandement le débogage !
