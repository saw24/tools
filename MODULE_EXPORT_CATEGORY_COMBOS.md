# 📦 Module: Export CategoryCombos + Dépendances

## 📋 Vue d'ensemble

Ce module permet d'exporter des CategoryCombos DHIS2 avec **toutes leurs dépendances** pour faciliter la migration entre instances.

## 🎯 Fonctionnalités

### Export complet

- ✅ **CategoryCombos** - Les combinaisons de catégories sélectionnées
- ✅ **Categories** - Les catégories utilisées
- ✅ **CategoryOptions** - Toutes les options de catégories
- ✅ **CategoryOptionCombos** - Les combinaisons d'options
- ✅ **CategoryOptionGroups** - Les groupes d'options (optionnel)
- ✅ **CategoryOptionGroupSets** - Les ensembles de groupes (optionnel)

### Multi-export

- ✅ **Plusieurs UID** - Exportez plusieurs CategoryCombos en une seule fois
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

Entrez un ou plusieurs UID de CategoryCombos :

```
bjDvmb4bfuf;m2jTvAj5kkm,p0KPaWEg3cf
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

Cliquez sur **"Exporter X CategoryCombo(s)"**.

Le fichier JSON sera téléchargé automatiquement :
```
category-combos-export-2025-12-05.json
```

## 📊 Format du fichier exporté

### Structure JSON

```json
{
  "categoryCombos": [
    {
      "id": "bjDvmb4bfuf",
      "name": "default",
      "shortName": "default",
      "dataDimensionType": "DISAGGREGATION",
      "categories": [{ "id": "GLevLNI9wkl" }]
    }
  ],
  "categories": [...],
  "categoryOptions": [...],
  "categoryOptionCombos": [...],
  "categoryOptionGroups": [...],
  "categoryOptionGroupSets": [...]
}
```

### Champs exportés

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

**Fichier** : `export-category-combos.html`

**Fonctionnalités** :
- Validation des UID en temps réel
- Compteur d'UID valides
- Gestion des options d'export
- Affichage du résumé
- Téléchargement automatique

### Backend

**Fichier** : `api/export-category-combos.php`

**Processus** :
1. Parser les UID (séparateurs `;` et `,`)
2. Valider les UID (11 caractères)
3. Pour chaque UID :
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
• CategoryCombos : 2
• Catégories : 4
• Options : 10
• Combos d'options : 20
• Groupes : 3
• GroupSets : 1
```

## 🎯 Cas d'usage

### Migration entre instances

**Scénario** : Copier des CategoryCombos d'une instance de développement vers la production.

**Étapes** :
1. Exporter depuis l'instance source
2. Importer dans l'instance cible via `/api/metadata`

### Standardisation

**Scénario** : Standardiser les CategoryCombos entre plusieurs instances.

**Étapes** :
1. Créer les CategoryCombos sur une instance de référence
2. Exporter avec toutes les dépendances
3. Importer sur toutes les autres instances

### Backup

**Scénario** : Sauvegarder les CategoryCombos critiques.

**Étapes** :
1. Lister les UID des combos critiques
2. Exporter avec toutes les dépendances
3. Stocker le JSON en sécurité

## 🔗 Différence avec l'export Data Elements

| Aspect | Data Elements | CategoryCombos |
|--------|---------------|----------------|
| **Objet principal** | DataElement | CategoryCombo |
| **Dépendance principale** | CategoryCombo | Categories |
| **Cas d'usage** | Migration de formulaires | Migration de désagrégations |
| **Complexité** | Moyenne | Faible |

## ⚠️ Limitations

### Dépendances non incluses

- ❌ **DataElements** utilisant les CategoryCombos
- ❌ **Indicators** utilisant les CategoryCombos
- ❌ **DataSets** utilisant les CategoryCombos

### Taille maximale

- **Recommandé** : < 20 CategoryCombos par export
- **Maximum** : Dépend de la mémoire PHP et du timeout

### Timeout

- **Timeout PHP** : 30 secondes par défaut
- **Solution** : Exporter en plusieurs fois si timeout

## 🔮 Améliorations futures

### Court terme
- [ ] Prévisualisation de la structure avant export
- [ ] Export par type (DISAGGREGATION, ATTRIBUTE)
- [ ] Validation du JSON avant téléchargement

### Moyen terme
- [ ] Comparaison entre instances
- [ ] Import direct depuis l'interface
- [ ] Gestion des conflits

### Long terme
- [ ] Synchronisation automatique
- [ ] Historique des exports
- [ ] Templates de CategoryCombos

## 📝 Notes importantes

### Import dans DHIS2

Pour importer le fichier JSON :

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -u admin:district \
  -d @category-combos-export-2025-12-05.json \
  https://target-instance/api/metadata
```

Ou via l'interface DHIS2 :
1. **Import/Export** → **Metadata Import**
2. Sélectionner le fichier JSON
3. Choisir la stratégie d'import
4. Cliquer sur **Import**

### Ordre d'import

DHIS2 gère automatiquement l'ordre d'import :
1. CategoryOptions
2. Categories
3. CategoryCombos
4. CategoryOptionCombos
5. CategoryOptionGroups
6. CategoryOptionGroupSets

### Conflits

Si des éléments existent déjà :
- **CREATE_AND_UPDATE** : Met à jour les existants
- **CREATE** : Ignore les existants
- **UPDATE** : Met à jour uniquement

## 💡 Conseils

### Identifier les UID

Pour trouver les UID des CategoryCombos :

```bash
# Via API
curl -u admin:district \
  "https://play.dhis2.org/api/categoryCombos?fields=id,name&paging=false"

# Via interface
Maintenance → Category → Category combination
```

### Vérifier avant import

Avant d'importer, vérifiez :
- ✅ Pas de conflits d'UID
- ✅ Pas de noms en double
- ✅ Structure JSON valide

## ✅ Checklist d'utilisation

- [ ] Connexion DHIS2 active
- [ ] UID des CategoryCombos identifiés
- [ ] Options d'export configurées
- [ ] Export réussi
- [ ] Fichier JSON téléchargé
- [ ] Résumé vérifié
- [ ] Prêt pour l'import

## 🎉 Résultat

Un fichier JSON complet contenant tous les éléments nécessaires pour importer les CategoryCombos sur une autre instance DHIS2, sans dépendances manquantes.

---

**Auteur** : Antigravity AI  
**Date** : 2025-12-05  
**Version** : 1.0.0
