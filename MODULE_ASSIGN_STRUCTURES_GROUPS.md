# 📦 Module: Affectation des Groupes aux Structures

## 📋 Vue d'ensemble

Module permettant d'assigner des groupes aux structures organisationnelles DHIS2 de manière efficace et ergonomique.

**Fichiers:**
- `assign-structures-groups.html` - Interface frontend
- `api/assign-org-units-groups.php` - API backend

## 🎯 Fonctionnalités

### 1. **Catégorisation intelligente**
Les structures sont automatiquement triées en 3 catégories:
- 🔴 **Sans groupe** (priorité haute)
- 🟡 **Groupes incomplets** (à compléter)
- 🟢 **Complets** (masqués par défaut)

### 2. **Interface interactive**
- Table avec cases à cocher pour chaque groupe
- Filtrage par groupes spécifiques
- Sélection multiple avec checkbox "Tout cocher"
- Mise à jour du compteur de groupes en temps réel

### 3. **Opérations en masse**
- Affectation groupée de groupes à plusieurs structures
- Historique des changements avant application
- Validation et feedback en temps réel

### 4. **Notifications**
- Toast notifications pour les succès/erreurs
- Messages d'information contextuelle
- Compteur de changements appliqués

## 🔧 Architecture technique

### Backend (PHP)

**Classe:** `AssignOrgUnitsGroupsAPI`

#### Actions disponibles:

1. **`action=list`** - Récupérer les structures catégorisées
   - Requête: POST avec config DHIS2
   - Réponse: Structures groupées par état

2. **`action=groups`** - Récupérer les groupes disponibles
   - Requête: POST avec config DHIS2
   - Réponse: Liste des groupes triée

3. **`action=stats`** - Récupérer les statistiques
   - Total structures et groupes

4. **`action=assign`** - Appliquer les changements
   - Requête: POST avec tableau d'affectations
   - Utilise PATCH sur `/api/organisationUnits/{id}`

### Frontend (JavaScript/HTML)

**Classe:** `AssignGroupsModule`

#### Flux principal:
1. Chargement des données (groupes + structures)
2. Rendu de la sidebar (catégories)
3. Sélection d'une catégorie
4. Rendu de la table interactive
5. Modification des affectations
6. Envoi au backend via `applyChanges()`

#### Gestion de l'état:
- `this.changes` - Map des modifications (structure ID → array de groupes)
- `this.selectedCategory` - Catégorie active
- `this.selectedGroupFilters` - Filtres appliqués

## 📊 Flux de données

```
DHIS2
  ↓
API: /list → Récupère structures + groupes
  ↓
Frontend: Catégorise + affiche
  ↓
Utilisateur: Modifie les cases à cocher
  ↓
Frontend: Accumule les changements dans this.changes
  ↓
API: /assign → Envoie les changements
  ↓
DHIS2: PATCH /api/organisationUnits/{id}
  ↓
API: Retourne résultats (succès/erreurs)
  ↓
Frontend: Toast + rechargement des données
```

## 🚀 Utilisation

### Pour l'utilisateur:
1. Accéder à `/assign-structures-groups.html`
2. Cliquer sur une catégorie (ex: "Sans groupe")
3. Vérifier les groupes à assigner (filtrage optionnel)
4. Cocher les cases pour assigner les groupes
5. Cliquer "Appliquer les changements"

### Pour les développeurs:
```javascript
// Initialiser le module
const module = new AssignGroupsModule();

// Charger les données
await module.loadData();

// Récupérer les structures
console.log(module.allOrgUnits);
console.log(module.allGroups);
```

## 🔗 Intégration à DHIS2

Le module utilise l'API DHIS2 via:
- `GET /api/organisationUnitGroups` - Récupérer groupes
- `GET /api/organisationUnits` - Récupérer structures avec groupes
- `PATCH /api/organisationUnits/{id}` - Mettre à jour structure

### Payload PATCH:
```json
{
  "organisationUnitGroups": [
    {"id": "group1"},
    {"id": "group2"}
  ]
}
```

## 🎨 Personnalisation

### Couleurs (CSS variables):
```css
--primary-color: #3b82f6;      /* Bleu principal */
--success-color: #10b981;      /* Vert */
--warning-color: #f59e0b;      /* Orange */
--danger-color: #ef4444;       /* Rouge */
```

### Icônes de catégorie:
```javascript
// Dans renderCategories()
{ key: 'without_groups', icon: '🔴', label: 'Sans groupe' },
{ key: 'incomplete_groups', icon: '🟡', label: 'Groupes incomplets' },
{ key: 'complete', icon: '🟢', label: 'Complets' }
```

## 📈 Amélioration futures possibles

- [ ] Export/import de la matrice d'affectation
- [ ] Historique des changements avec audit log
- [ ] Recherche/filtrage par nom de structure
- [ ] Mode "Bulk" pour appliquer le même groupe à plusieurs structures
- [ ] Validation avant application (structures en doublon, etc.)
- [ ] Support du drag-and-drop
- [ ] Affichage du chemin hiérarchique des structures

## ⚠️ Notes importantes

1. **Performance**: Pour > 10K structures, la pagination est recommandée
2. **Authentification**: Repose sur `window.config` et `window.dhis2Session`
3. **CORS**: L'API utilise `Access-Control-Allow-Origin: *`
4. **Erreurs**: Les erreurs DHIS2 HTTP >= 400 sont loggées et affichées

## 🐛 Dépannage

### Module ne charge pas:
- Vérifier que `window.config` est défini
- Vérifier que `window.dhis2Session` existe
- Vérifier les logs navigateur (F12)

### Changements ne s'appliquent pas:
- Vérifier les permissions DHIS2 de l'utilisateur
- Vérifier que l'API retourne des erreurs (console)
- Vérifier la configuration DHIS2 (URL, auth)

### Table reste vide:
- Vérifier qu'il y a des structures dans la catégorie
- Vérifier les filtres appliqués (groupes sélectionnés)
