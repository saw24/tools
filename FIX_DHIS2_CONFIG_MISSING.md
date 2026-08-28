# 🔧 Fix: Configuration DHIS2 manquante

## 📋 Problème

Erreur 500 lors de l'export avec le message :
```json
{
  "success": false,
  "message": "Configuration DHIS2 manquante",
  "timestamp": "2025-12-05 11:15:13"
}
```

## 🔍 Cause

Le payload envoyé à l'API PHP ne contenait pas les credentials DHIS2 (`dhis2_url` et `dhis2_auth`).

### Code avant (incorrect)

```javascript
const payload = {
    dataElementUids: uids.join(';'),
    includeGroups,
    includeGroupSets
};
```

L'API PHP attend :
```php
if (empty($input['dhis2_url']) || empty($input['dhis2_auth'])) {
    throw new Exception('Configuration DHIS2 manquante');
}
```

## ✅ Solution

Ajouter les credentials DHIS2 au payload en récupérant la config depuis `dhis2Session`.

### Code après (correct)

```javascript
// Récupérer la config DHIS2
const config = dhis2Session.getConfig();
if (!config) {
    throw new Error('Session DHIS2 non trouvée. Veuillez vous reconnecter.');
}

const payload = {
    dhis2_url: config.url,
    dhis2_auth: config.authHeader,
    dataElementUids: uids.join(';'),
    includeGroups,
    includeGroupSets
};
```

## 📊 Payload complet

```json
{
  "dhis2_url": "https://play.dhis2.org/2.40.0",
  "dhis2_auth": "Basic YWRtaW46ZGlzdHJpY3Q=",
  "dataElementUids": "hX7n8Y4pu89;abc123def45",
  "includeGroups": true,
  "includeGroupSets": true
}
```

## 🎯 Fichier modifié

**Fichier** : `export-data-elements-dependencies.html`  
**Ligne** : 502-507  
**Fonction** : `exportDataElements()`

## 📝 Leçon apprise

Toutes les requêtes vers les APIs PHP qui communiquent avec DHIS2 doivent inclure :
- ✅ `dhis2_url` - L'URL de l'instance DHIS2
- ✅ `dhis2_auth` - Le header d'authentification (Basic Auth encodé en base64)

## ✅ Vérification

Après la correction, le payload contient :
1. ✅ `dhis2_url`
2. ✅ `dhis2_auth`
3. ✅ `dataElementUids`
4. ✅ `includeGroups`
5. ✅ `includeGroupSets`

## 🔮 Prévention

Pour éviter ce problème à l'avenir :

### Template de requête API

```javascript
async function callDHIS2API(endpoint, data) {
    // Toujours récupérer la config
    const config = dhis2Session.getConfig();
    if (!config) {
        throw new Error('Session DHIS2 non trouvée');
    }

    // Toujours inclure les credentials
    const payload = {
        dhis2_url: config.url,
        dhis2_auth: config.authHeader,
        ...data  // Vos données spécifiques
    };

    return await $.ajax({
        url: endpoint,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        dataType: 'json'
    });
}
```

### Checklist avant chaque requête

- [ ] Récupérer `dhis2Session.getConfig()`
- [ ] Vérifier que `config` n'est pas null
- [ ] Inclure `dhis2_url` dans le payload
- [ ] Inclure `dhis2_auth` dans le payload
- [ ] Ajouter les données spécifiques

## 📚 Modules concernés

Tous les modules qui communiquent avec DHIS2 via PHP :
- ✅ `export-data-elements.html`
- ✅ `export-data-elements-dependencies.html`
- ✅ `excel-mapping.html`
- ✅ `test-backend.html`

## 🎉 Résultat

Après la correction, l'export fonctionne correctement et retourne :
```json
{
  "success": true,
  "message": "Export de 2 DataElement(s) réussi",
  "dataElementCount": 2,
  "data": { ... },
  "summary": { ... }
}
```

---

**Fix appliqué** : 2025-12-05  
**Fichier** : `export-data-elements-dependencies.html`  
**Statut** : ✅ Résolu
