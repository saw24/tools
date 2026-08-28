# 📦 Module: Export Éléments de Données + Dépendances

## 📋 Vue d'ensemble

Ce module permet d'exporter des éléments de données DHIS2 avec **toutes leurs dépendances** pour faciliter la migration entre instances.

## 🎯 Fonctionnalités

### Export complet

- ✅ **Data Elements** - Les éléments de données sélectionnés
- ✅ **CategoryCombos** - Les combinaisons de catégories associées
- ✅ **Categories** - Les catégories utilisées
- ✅ **CategoryOptions** - Toutes les options de catégories
- ✅ **CategoryOptionCombos** - Les combinaisons d'options
- ✅ **CategoryOptionGroups** - Les groupes d'options (optionnel)
- ✅ **CategoryOptionGroupSets** - Les ensembles de groupes (optionnel)

### Multi-export

- ✅ **Plusieurs UID** - Exportez plusieurs data elements en une seule fois
- ✅ **Séparateurs flexibles** - Utilisez `;` ou `,` pour séparer les UID
- ✅ **Validation en temps réel** - Vérification des UID (11 caractères)
- ✅ **Dé-duplication** - Suppression automatique des doublons

### Options configurables

- ✅ **Inclure les Groups** - Optionnel
- ✅ **Inclure les GroupSets** - Optionnel
- ✅ **Format JSON** - Prêt pour l'import DHIS2

## 🚀 Utilisation

### 1. Connexion DHIS2

Connectez-vous à votre instance DHIS2 source.

### 2. Saisir les UID

Entrez un ou plusieurs UID de Data Elements :

```
hX7n8Y4pu89;abc123def45,xyz987uvw65
```

**Formats acceptés** :
- Séparés par `;` : `uid1;uid2;uid3`
- Séparés par `,` : `uid1,uid2,uid3`
- Mélangés : `uid1;uid2,uid3`
- Multi-lignes : Un UID par ligne

### 3. Options d'export

**Inclure les CategoryOptionGroups** :
- ☑️ Coché : Exporte les groupes d'options
- ☐ Décoché : Ignore les groupes

**Inclure les CategoryOptionGroupSets** :
- ☑️ Coché : Exporte les ensembles de groupes
- ☐ Décoché : Ignore les ensembles

### 4. Exporter

Cliquez sur **"Exporter X élément(s)"**.

Le fichier JSON sera téléchargé automatiquement :
```
data-elements-export-2025-12-05.json
```

## 📊 Format du fichier exporté

### Structure JSON

```json
{
  "dataElements": [
    {
      "id": "hX7n8Y4pu89",
      "name": "ANC 1st visit",
      "shortName": "ANC 1st visit",
      "description": "...",
      "aggregationType": "SUM",
      "domainType": "AGGREGATE",
      "valueType": "INTEGER",
      "zeroIsSignificant": false,
      "categoryCombo": { "id": "bjDvmb4bfuf" }
    }
  ],
  "categoryCombos": [...],
  "categories": [...],
  "categoryOptions": [...],
  "categoryOptionCombos": [...],
  "categoryOptionGroups": [...],
  "categoryOptionGroupSets": [...]
}
```

### Champs exportés

#### DataElement
- `id`, `name`, `shortName`, `description`
- `aggregationType`, `domainType`, `valueType`
- `zeroIsSignificant`, `categoryCombo`

#### CategoryCombo
- `id`, `name`, `shortName`, `dataDimensionType`
- `categories` (références)

#### Category
- `id`, `name`, `shortName`, `dataDimensionType`
- `categoryOptions` (références)

#### CategoryOption
- `id`, `name`, `shortName`, `aggregationType`

#### CategoryOptionCombo
- `id`, `aggregationType`, `dimensionItemType`
- `categoryCombo`, `categoryOptions` (références)

#### CategoryOptionGroup (optionnel)
- `id`, `name`, `shortName`
- `categoryOptions` (références)

#### CategoryOptionGroupSet (optionnel)
- `id`, `name`, `shortName`
- `categoryOptionGroups` (références)

## 🔧 Architecture technique

### Frontend

**Fichier** : `export-data-elements-dependencies.html`

**Fonctionnalités** :
- Validation des UID en temps réel
- Compteur d'UID valides
- Gestion des options d'export
- Affichage du résumé
- Téléchargement automatique

### Backend

**Fichier** : `api/export-data-elements-deps.php`

**Processus** :
1. Parser les UID (séparateurs `;` et `,`)
2. Valider les UID (11 caractères)
3. Pour chaque UID :
   - Récupérer le Data Element
   - Récupérer le CategoryCombo
   - Récupérer les Categories
   - Récupérer les CategoryOptions
   - Récupérer les CategoryOptionCombos
   - Récupérer les Groups (si demandé)
   - Récupérer les GroupSets (si demandé)
4. Fusionner toutes les dépendances
5. Dé-dupliquer par ID
6. Retourner le package JSON

### API DHIS2 utilisée

```
GET /api/dataElements/{id}
GET /api/categoryCombos/{id}
GET /api/categories/{id}
GET /api/categoryOptions/{id}
GET /api/categoryOptionCombos/{id}
GET /api/categoryOptionGroups?paging=false
GET /api/categoryOptionGroupSets?paging=false
```

## 📈 Exemple de résumé

Après un export réussi :

```
Résumé de l'export :
• DataElements : 3
• CategoryCombos : 2
• Catégories : 5
• Options : 12
• Combos d'options : 24
• Groupes : 4
• GroupSets : 2
```

## 🎯 Cas d'usage

### Migration entre instances

**Scénario** : Copier des data elements d'une instance de développement vers la production.

**Étapes** :
1. Exporter depuis l'instance source
2. Importer dans l'instance cible via `/api/metadata`

### Backup sélectif

**Scénario** : Sauvegarder certains data elements critiques.

**Étapes** :
1. Lister les UID des éléments critiques
2. Exporter avec toutes les dépendances
3. Stocker le JSON en sécurité

### Documentation

**Scénario** : Documenter la structure des data elements.

**Étapes** :
1. Exporter les éléments
2. Analyser le JSON pour comprendre les relations
3. Générer la documentation

## ⚠️ Limitations

### Dépendances non incluses

- ❌ **Indicators** utilisant les data elements
- ❌ **DataSets** contenant les data elements
- ❌ **ValidationRules** référençant les data elements
- ❌ **PredictorFormulas** utilisant les data elements

### Taille maximale

- **Recommandé** : < 50 data elements par export
- **Maximum** : Dépend de la mémoire PHP et du timeout

### Timeout

- **Timeout PHP** : 30 secondes par défaut
- **Solution** : Exporter en plusieurs fois si timeout

## 🔮 Améliorations futures

### Court terme
- [ ] Export par DataSet (tous les éléments d'un dataset)
- [ ] Prévisualisation avant export
- [ ] Validation du JSON avant téléchargement

### Moyen terme
- [ ] Export incrémental (uniquement les nouveaux)
- [ ] Comparaison entre instances
- [ ] Import direct depuis l'interface

### Long terme
- [ ] Synchronisation automatique
- [ ] Gestion des conflits
- [ ] Historique des exports

## 📝 Notes importantes

### Import dans DHIS2

Pour importer le fichier JSON :

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -u admin:district \
  -d @data-elements-export-2025-12-05.json \
  https://target-instance/api/metadata
```

Ou via l'interface DHIS2 :
1. **Import/Export** → **Metadata Import**
2. Sélectionner le fichier JSON
3. Choisir la stratégie d'import
4. Cliquer sur **Import**

### Ordre d'import

DHIS2 gère automatiquement l'ordre d'import des métadonnées.

### Conflits

Si des éléments existent déjà :
- **CREATE_AND_UPDATE** : Met à jour les existants
- **CREATE** : Ignore les existants
- **UPDATE** : Met à jour uniquement

## ✅ Checklist d'utilisation

- [ ] Connexion DHIS2 active
- [ ] UID des data elements identifiés
- [ ] Options d'export configurées
- [ ] Export réussi
- [ ] Fichier JSON téléchargé
- [ ] Résumé vérifié
- [ ] Prêt pour l'import

## 🎉 Résultat

Un fichier JSON complet contenant tous les éléments nécessaires pour importer les data elements sur une autre instance DHIS2, sans dépendances manquantes.

---

**Auteur** : Antigravity AI  
**Date** : 2025-12-05  
**Version** : 1.0.0
