# 🏗️ Architecture Modulaire des APIs

## 📋 Vue d'ensemble

Le projet utilise une architecture modulaire pour les APIs, permettant une meilleure organisation, maintenabilité et scalabilité.

## 🎯 Principe

Chaque module DHIS2 possède sa propre API dédiée, en plus du proxy générique.

### Structure

```
api/
├── dhis2-proxy.php          # Proxy générique pour toutes les requêtes DHIS2
├── export-data-elements.php # API dédiée au module d'export
├── [future-module].php      # APIs futures pour d'autres modules
└── api1.php                 # API Excel mapping (existante)
```

## 🔄 Deux approches possibles

### 1. Proxy générique (actuel)

**Fichier** : `api/dhis2-proxy.php`

**Utilisation** :
```javascript
// Depuis n'importe quel module
const response = await dhis2Session.get('/api/dataSets', { ... });
```

**Avantages** :
- ✅ Simple et unifié
- ✅ Un seul point d'entrée
- ✅ Réutilisable partout

**Inconvénients** :
- ⚠️ Moins de contrôle par module
- ⚠️ Difficile d'ajouter une logique spécifique

### 2. API modulaire (nouveau)

**Fichier** : `api/export-data-elements.php`

**Utilisation** :
```javascript
// Liste des datasets
fetch('/saw-dhis2-tools/api/export-data-elements.php?action=list', {
    method: 'POST',
    body: JSON.stringify({
        dhis2_url: config.url,
        dhis2_auth: config.authHeader
    })
});

// Export d'un dataset
fetch('/saw-dhis2-tools/api/export-data-elements.php?action=export&dataSetId=xxx', {
    method: 'POST',
    body: JSON.stringify({
        dhis2_url: config.url,
        dhis2_auth: config.authHeader
    })
});
```

**Avantages** :
- ✅ Logique métier spécifique au module
- ✅ Validation personnalisée
- ✅ Cache possible par module
- ✅ Meilleure séparation des responsabilités

**Inconvénients** :
- ⚠️ Plus de fichiers à maintenir
- ⚠️ Duplication potentielle de code

## 🎨 Architecture recommandée : Hybride

### Utiliser les deux approches

1. **Proxy générique** pour les requêtes simples et directes
2. **APIs modulaires** pour les modules avec logique métier complexe

### Exemple d'implémentation

#### Module simple (utilise le proxy)
```javascript
// Module de consultation simple
const indicators = await dhis2Session.getIndicators();
```

#### Module complexe (utilise son API)
```javascript
// Module d'export avec logique métier
const response = await fetch('/saw-dhis2-tools/api/export-data-elements.php?action=export', {
    method: 'POST',
    body: JSON.stringify({
        dhis2_url: config.url,
        dhis2_auth: config.authHeader,
        dataSetId: 'xxx',
        format: 'csv',
        includeMetadata: true
    })
});
```

## 📁 Structure d'une API modulaire

### Template de base

```php
<?php
/**
 * API Module: [Nom du module]
 * Description: [Description]
 */

class ModuleAPI {
    private $dhis2Url;
    private $dhis2Auth;

    public function handleRequest() {
        $action = $_GET['action'] ?? 'default';
        
        switch ($action) {
            case 'action1':
                $this->action1();
                break;
            case 'action2':
                $this->action2();
                break;
            default:
                throw new Exception('Action non reconnue');
        }
    }

    private function action1() {
        // Logique métier
    }

    private function loadDHIS2Config() {
        // Charger la config depuis la requête
    }

    private function makeRequest($endpoint, $method = 'GET') {
        // Faire une requête vers DHIS2
    }

    private function sendResponse($success, $message, $data = null) {
        // Envoyer la réponse JSON
    }
}

// Point d'entrée
$api = new ModuleAPI();
$api->handleRequest();
```

## 🔧 Configuration du chemin du proxy

### Problème résolu

Le chemin du proxy était relatif (`api/dhis2-proxy.php`), ce qui ne fonctionnait pas depuis toutes les pages.

### Solution

Utiliser un **chemin absolu** depuis la racine :

```javascript
// Dans dhis2-session-manager.js
this.apiBaseUrl = '/saw-dhis2-tools/api/dhis2-proxy.php';
```

**Avantages** :
- ✅ Fonctionne depuis n'importe quelle page
- ✅ Simple et prévisible
- ✅ Pas de calcul de chemin relatif

## 📊 Quand utiliser quelle approche ?

### Utiliser le proxy générique si :
- ✅ Requête simple vers DHIS2
- ✅ Pas de logique métier complexe
- ✅ Pas de transformation de données
- ✅ Pas de cache nécessaire

### Utiliser une API modulaire si :
- ✅ Logique métier spécifique
- ✅ Validation complexe
- ✅ Transformation de données
- ✅ Cache ou optimisations
- ✅ Agrégation de plusieurs requêtes DHIS2

## 🎯 Exemples de modules

### Module 1 : Export Data Elements (API modulaire)

**Raisons** :
- Logique de formatage CSV
- Validation des datasets
- Possibilité de cache
- Agrégation de données

**API** : `api/export-data-elements.php`

**Actions** :
- `list` - Liste des datasets
- `export` - Export d'un dataset

### Module 2 : Consultation simple (Proxy générique)

**Raisons** :
- Affichage direct des données DHIS2
- Pas de transformation
- Requêtes simples

**Utilisation** : `dhis2Session.get('/api/...')`

## 🔮 Évolution future

### Court terme
- [ ] Créer une classe de base commune pour les APIs modulaires
- [ ] Ajouter un système de cache Redis/Memcached
- [ ] Implémenter des logs centralisés

### Moyen terme
- [ ] Ajouter une couche d'authentification par API
- [ ] Implémenter des rate limits
- [ ] Créer un système de webhooks

### Long terme
- [ ] Microservices pour chaque module
- [ ] API Gateway centralisée
- [ ] GraphQL pour requêtes complexes

## 📝 Recommandations

### Pour les développeurs

1. **Commencez simple** : Utilisez le proxy générique
2. **Évoluez si nécessaire** : Créez une API modulaire si la logique devient complexe
3. **Réutilisez** : Créez des classes de base communes
4. **Documentez** : Chaque API doit avoir sa documentation

### Pour la maintenance

1. **Versionnez** : Utilisez des versions d'API (`/api/v1/...`)
2. **Testez** : Créez des tests unitaires pour chaque API
3. **Loggez** : Gardez des traces de toutes les requêtes
4. **Sécurisez** : Validez toutes les entrées

## 🛠️ Outils recommandés

### Développement
- **Postman** - Tester les APIs
- **PHPUnit** - Tests unitaires
- **Xdebug** - Débogage

### Production
- **Redis** - Cache
- **Nginx** - Reverse proxy
- **PM2** - Monitoring (si Node.js)

## ✅ Checklist pour créer une nouvelle API modulaire

- [ ] Créer le fichier `api/[module-name].php`
- [ ] Définir les actions disponibles
- [ ] Implémenter la logique métier
- [ ] Ajouter la validation des entrées
- [ ] Gérer les erreurs
- [ ] Documenter l'API
- [ ] Créer des tests
- [ ] Mettre à jour ce document

## 📚 Ressources

- [PHP Best Practices](https://www.php-fig.org/psr/)
- [REST API Design](https://restfulapi.net/)
- [DHIS2 API Documentation](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/introduction.html)

---

**Auteur** : Antigravity AI  
**Date** : 2025-12-05  
**Version** : 1.0.0
