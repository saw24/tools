# Backend DHIS2 - Guide de mise en place

## 📋 Vue d'ensemble

Ce backend fournit une infrastructure complète pour se connecter et interagir avec les instances DHIS2. Il est inspiré du pattern Node.js `dhis2-session-manager` mais adapté pour un environnement PHP/JavaScript.

## 🏗️ Architecture

```
Frontend (Browser)
    ↓
dhis2-session-manager.js (JavaScript)
    ↓
dhis2-proxy.php (PHP Backend)
    ↓
DHIS2 Server (API REST)
```

## 📦 Fichiers créés

### 1. JavaScript (Frontend)

- **`js/dhis2-session-manager.js`** : Gestionnaire de session principal
  - Gestion de l'authentification
  - Méthodes HTTP (GET, POST, PUT, DELETE)
  - Gestion automatique des erreurs
  - Méthodes utilitaires pour DHIS2

- **`js/dhis2-auth.js`** : Module d'authentification UI (amélioré)
  - Modal de connexion
  - Gestion de l'état de connexion
  - Feedback utilisateur

### 2. PHP (Backend)

- **`api/dhis2-proxy.php`** : Proxy API
  - Gestion des requêtes vers DHIS2
  - Authentification Basic Auth
  - Gestion des cookies de session
  - Support de toutes les méthodes HTTP

### 3. Configuration

- **`.env.example`** : Exemple de configuration
- **`API_DOCUMENTATION.md`** : Documentation complète de l'API

## 🚀 Installation

### Prérequis

- PHP 7.4 ou supérieur
- Extension PHP cURL activée
- Serveur web (Apache/Nginx) ou MAMP
- Accès à une instance DHIS2

### Configuration

1. **Copier le fichier de configuration** (optionnel)
   ```bash
   cp .env.example .env
   ```

2. **Vérifier les permissions**
   ```bash
   chmod 755 api/dhis2-proxy.php
   ```

3. **Vérifier que cURL est activé**
   ```bash
   php -m | grep curl
   ```

## 💻 Utilisation

### Connexion à DHIS2

```javascript
// Initialiser la connexion
await dhis2Session.initialize(
    'https://play.dhis2.org/2.40.0',
    'admin',
    'district'
);

// Tester la connexion
const result = await dhis2Session.testConnection();
if (result.success) {
    console.log('Connecté !', result.user);
}
```

### Exemples de requêtes

#### Obtenir les informations de l'utilisateur
```javascript
const user = await dhis2Session.getCurrentUser();
console.log(user);
```

#### Récupérer des data elements
```javascript
const dataElements = await dhis2Session.getDataElements({
    fields: 'id,name,displayName',
    filter: 'domainType:eq:AGGREGATE',
    pageSize: 50
});
```

#### Envoyer des données
```javascript
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

## 🔧 Configuration avancée

### Modifier le timeout des requêtes

Dans `api/dhis2-proxy.php`, ligne ~120 :
```php
CURLOPT_TIMEOUT => 30, // Modifier ici (en secondes)
```

### Désactiver la vérification SSL (développement uniquement)

Dans `api/dhis2-proxy.php`, ligne ~122 :
```php
CURLOPT_SSL_VERIFYPEER => false, // ⚠️ Non recommandé en production
```

### Activer le mode debug

Dans la console du navigateur :
```javascript
dhis2Session.debug = true;
```

## 🔒 Sécurité

### Points importants

1. **Pas de stockage de mot de passe** : Seul le header Basic Auth encodé est stocké en session
2. **Session Storage** : Les credentials sont effacés à la fermeture du navigateur
3. **HTTPS obligatoire** : Toujours utiliser HTTPS pour les instances DHIS2
4. **Validation côté serveur** : Le proxy PHP valide toutes les entrées
5. **Protection CORS** : Configurez les origines autorisées si nécessaire

### Recommandations

- Ne jamais commiter de fichiers `.env` avec des credentials
- Utiliser des variables d'environnement en production
- Implémenter une authentification côté serveur pour les applications publiques
- Limiter les origines CORS autorisées

## 🐛 Débogage

### Vérifier la connexion PHP

```bash
php -r "echo 'PHP Version: ' . phpversion() . PHP_EOL;"
php -r "var_dump(extension_loaded('curl'));"
```

### Tester le proxy directement

```bash
curl -X POST http://localhost/api/dhis2-proxy.php \
  -H "Content-Type: application/json" \
  -d '{
    "dhis2_url": "https://play.dhis2.org/2.40.0",
    "dhis2_endpoint": "/api/me",
    "dhis2_method": "GET",
    "dhis2_auth": "Basic YWRtaW46ZGlzdHJpY3Q="
  }'
```

### Logs PHP

Vérifier les logs d'erreur PHP :
```bash
# Sur MAMP
tail -f /Applications/MAMP/logs/php_error.log

# Sur Apache standard
tail -f /var/log/apache2/error.log
```

### Console JavaScript

```javascript
// Vérifier l'état de la session
console.log(dhis2Session.getConfig());

// Vérifier si connecté
console.log(dhis2Session.isConnected());

// Tester une requête simple
dhis2Session.get('/api/me')
    .then(data => console.log('Success:', data))
    .catch(err => console.error('Error:', err));
```

## 📚 Ressources

- [Documentation DHIS2 API](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/web-api.html)
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Documentation complète de l'API
- [DHIS2 Developer Portal](https://developers.dhis2.org/)

## 🔄 Différences avec le code Node.js

| Fonctionnalité | Node.js (Original) | PHP/JavaScript (Ce projet) |
|----------------|-------------------|---------------------------|
| Gestion de session | Axios interceptors | Proxy PHP + Session Storage |
| Cookies | Automatique (Axios) | Extraction manuelle |
| Authentification | Basic Auth direct | Basic Auth via proxy |
| Environnement | Serveur (Node.js) | Client (Browser) + Serveur (PHP) |
| Configuration | Variables d'env (.env) | Session Storage + .env optionnel |

## ✅ Tests

### Test de connexion basique

1. Ouvrir `index.html` dans le navigateur
2. Cliquer sur "Connexion DHIS2"
3. Entrer les credentials de test :
   - URL: `https://play.dhis2.org/2.40.0`
   - Username: `admin`
   - Password: `district`
4. Vérifier la connexion réussie

### Test de requête API

Ouvrir la console du navigateur et exécuter :
```javascript
// Test GET
dhis2Session.get('/api/me').then(console.log);

// Test avec paramètres
dhis2Session.getDataElements({ pageSize: 5 }).then(console.log);
```

## 🆘 Problèmes courants

### Erreur CORS

**Symptôme** : `Access-Control-Allow-Origin` error

**Solution** : Le proxy PHP gère déjà CORS. Vérifiez que vous accédez via le bon domaine.

### Erreur 401 Unauthorized

**Symptôme** : Connexion refusée

**Solutions** :
1. Vérifier les credentials
2. Vérifier l'URL de l'instance DHIS2
3. Vérifier que l'instance est accessible

### Erreur cURL

**Symptôme** : `Erreur cURL: ...`

**Solutions** :
1. Vérifier que cURL est installé : `php -m | grep curl`
2. Vérifier la connectivité réseau
3. Vérifier les certificats SSL

### Session expirée

**Symptôme** : Déconnexion automatique

**Solution** : C'est normal, le système détecte automatiquement les sessions expirées et demande une reconnexion.

## 📝 Notes de développement

- Le gestionnaire de session est un **singleton** accessible via `window.dhis2Session`
- Les événements personnalisés `dhis2:connected` et `dhis2:disconnected` sont déclenchés
- Le proxy PHP supporte toutes les méthodes HTTP (GET, POST, PUT, DELETE, PATCH)
- Les cookies de session sont extraits mais pas encore utilisés (fonctionnalité future)

## 🔮 Améliorations futures

- [ ] Implémenter le cache côté client
- [ ] Ajouter le support des requêtes batch
- [ ] Implémenter la gestion des cookies de session
- [ ] Ajouter des métriques de performance
- [ ] Créer des tests unitaires
- [ ] Ajouter le support de OAuth2

## 👥 Contribution

Pour contribuer :
1. Créer une branche pour votre fonctionnalité
2. Tester localement
3. Documenter les changements
4. Soumettre une pull request

## 📄 Licence

Ce projet est sous licence MIT.
