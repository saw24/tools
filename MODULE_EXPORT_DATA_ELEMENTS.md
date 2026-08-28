# Module : Export Éléments de Données

## 📋 Vue d'ensemble

Le module **Export Éléments de Données** permet d'exporter la liste complète des éléments de données d'un ensemble de données (data set) DHIS2 au format CSV.

## 🎯 Fonctionnalités

### 1. Vérification de session DHIS2
- ✅ Vérifie automatiquement la présence d'une session DHIS2 active
- ✅ Affiche une notification si non connecté
- ✅ Redirige vers la page d'accueil après 3 secondes pour permettre la connexion

### 2. Liste des ensembles de données
- ✅ Affiche tous les ensembles de données (data sets) de l'instance DHIS2
- ✅ Tableau avec colonnes : ID, Nom, Type de période, Nombre d'éléments, Actions
- ✅ Chargement asynchrone avec indicateur de progression

### 3. Filtrage
- ✅ Recherche par ID ou nom d'ensemble de données
- ✅ Filtrage en temps réel (touche Entrée ou bouton Filtrer)
- ✅ Bouton "Effacer" pour réinitialiser le filtre
- ✅ Compteur de résultats

### 4. Export CSV
- ✅ Export au format CSV
- ✅ Colonnes exportées :
  - ID de l'élément de données
  - Nom (displayName)
  - Code
  - Type de valeur (valueType)
  - Type de domaine (domainType)
  - Catégorie Combo
- ✅ Nom de fichier : `data-elements_{dataSetId}_{timestamp}.csv`
- ✅ Encodage UTF-8

## 🚀 Utilisation

### Accès au module

1. **Depuis la page d'accueil** : Cliquer sur la carte "Export Éléments de Données"
2. **URL directe** : `export-data-elements.html`

### Workflow

```
1. Vérification de session DHIS2
   ↓
2. Chargement des ensembles de données
   ↓
3. Affichage de la liste
   ↓
4. [Optionnel] Filtrage par recherche
   ↓
5. Clic sur "Exporter" pour un ensemble
   ↓
6. Téléchargement du fichier CSV
```

### Exemple d'utilisation

1. **Se connecter à DHIS2** (si pas déjà connecté)
2. **Accéder au module** "Export Éléments de Données"
3. **Rechercher** un ensemble de données (ex: "ANC")
4. **Cliquer sur "Exporter"** pour l'ensemble souhaité
5. **Le fichier CSV est téléchargé** automatiquement

## 📊 Format du fichier CSV exporté

```csv
ID,Nom,Code,Type de valeur,Type de domaine,Catégorie Combo
"fbfJHSPpUQD","ANC 1st visit","DE_12345","INTEGER","AGGREGATE","default"
"cYeuwXTCPkU","ANC 2nd visit","DE_12346","INTEGER","AGGREGATE","default"
...
```

## 🔧 Aspects techniques

### Dépendances

- jQuery 3.6.0
- `dhis2-session-manager.js` - Gestion de session DHIS2
- `dhis2-auth.js` - Module d'authentification
- Font Awesome 6.4.0 - Icônes
- Google Fonts (Inter) - Typographie

### API DHIS2 utilisées

#### 1. Liste des ensembles de données
```javascript
GET /api/dataSets?fields=id,displayName,periodType,dataSetElements[dataElement[id,displayName]]&paging=false
```

#### 2. Détails d'un ensemble de données
```javascript
GET /api/dataSets/{id}?fields=id,displayName,dataSetElements[dataElement[id,displayName,code,valueType,domainType,categoryCombo[id,displayName]]]
```

### Fonctions principales

#### `loadDataSets()`
Charge tous les ensembles de données depuis DHIS2.

```javascript
async function loadDataSets() {
    const response = await dhis2Session.getDataSets({
        fields: 'id,displayName,periodType,dataSetElements[dataElement[id,displayName]]',
        paging: false
    });
    allDataSets = response.dataSets || [];
    renderTable();
}
```

#### `applyFilter()`
Filtre les ensembles de données selon le terme de recherche.

```javascript
function applyFilter() {
    const searchTerm = $('#filterSearch').val().toLowerCase().trim();
    filteredDataSets = allDataSets.filter(ds =>
        ds.id.toLowerCase().includes(searchTerm) ||
        ds.displayName.toLowerCase().includes(searchTerm)
    );
    renderTable();
}
```

#### `exportDataElements(dataSetId, dataSetName)`
Exporte les éléments de données au format CSV.

```javascript
async function exportDataElements(dataSetId, dataSetName) {
    const response = await dhis2Session.get(`/api/dataSets/${dataSetId}`, {
        fields: 'dataSetElements[dataElement[id,displayName,code,valueType,domainType,categoryCombo[displayName]]]'
    });
    
    // Créer CSV et télécharger
    const csv = createCSV(response.dataSetElements);
    downloadCSV(csv, `data-elements_${dataSetId}_${Date.now()}.csv`);
}
```

## 🎨 Interface utilisateur

### États de l'interface

1. **Loading** - Spinner pendant le chargement
2. **Liste** - Tableau des ensembles de données
3. **Empty** - Aucun résultat trouvé
4. **Error** - Erreur de chargement

### Notifications

- **Success** (vert) - Export réussi, données chargées
- **Error** (rouge) - Erreur de chargement, session manquante
- **Info** (bleu) - Export en cours
- **Warning** (orange) - Ensemble vide

## 🔒 Sécurité

### Vérification de session

```javascript
$(document).ready(async function () {
    if (!dhis2Session.isConnected()) {
        showNotification('error', 'Session DHIS2 requise...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
        return;
    }
    await loadDataSets();
});
```

### Gestion des erreurs

- Erreurs réseau → Toast d'erreur
- Session expirée → Redirection vers index
- Données manquantes → Message approprié

## 📱 Responsive Design

- ✅ Adapté pour desktop (1400px max-width)
- ✅ Tableau scrollable sur mobile
- ✅ Boutons et inputs tactiles

## 🧪 Tests

### Test 1 : Sans session DHIS2
1. Accéder au module sans être connecté
2. **Résultat attendu** : Notification + redirection vers index

### Test 2 : Chargement des données
1. Se connecter à DHIS2
2. Accéder au module
3. **Résultat attendu** : Liste des ensembles de données affichée

### Test 3 : Filtrage
1. Entrer "ANC" dans la recherche
2. Cliquer sur "Filtrer"
3. **Résultat attendu** : Seuls les ensembles contenant "ANC" sont affichés

### Test 4 : Export
1. Cliquer sur "Exporter" pour un ensemble
2. **Résultat attendu** : Fichier CSV téléchargé avec les éléments

### Test 5 : Ensemble vide
1. Exporter un ensemble sans éléments
2. **Résultat attendu** : Warning "Aucun élément"

## 🔮 Améliorations futures

- [ ] Export en Excel (XLSX)
- [ ] Export en JSON
- [ ] Prévisualisation avant export
- [ ] Sélection multiple d'ensembles
- [ ] Export groupé
- [ ] Filtres avancés (par type de période, etc.)
- [ ] Tri des colonnes
- [ ] Pagination pour grandes listes
- [ ] Recherche avancée avec opérateurs
- [ ] Sauvegarde des filtres favoris

## 📝 Notes

### Limitations
- Pas de pagination (charge tous les ensembles)
- Export uniquement en CSV
- Pas de prévisualisation des données

### Performance
- Chargement initial peut être long pour de grandes instances
- Filtrage côté client (rapide)
- Export asynchrone (non bloquant)

## 🆘 Dépannage

### Problème : "Session DHIS2 requise"
**Solution** : Se connecter via la page d'accueil

### Problème : "Impossible de charger les ensembles"
**Solutions** :
1. Vérifier la connexion internet
2. Vérifier que l'instance DHIS2 est accessible
3. Vérifier les permissions utilisateur

### Problème : Export ne démarre pas
**Solutions** :
1. Vérifier la console pour les erreurs
2. Vérifier que l'ensemble contient des éléments
3. Réessayer la connexion

## 📚 Ressources

- [API DHIS2 - Data Sets](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/metadata.html#webapi_data_sets)
- [API DHIS2 - Data Elements](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/metadata.html#webapi_data_elements)

---

**Auteur** : Antigravity AI  
**Date** : 2025-12-05  
**Version** : 1.0.0
