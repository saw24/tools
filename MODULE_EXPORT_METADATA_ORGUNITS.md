# Plan de Module : Export Métadonnées Unités d'Organisation (JSON)

## Objectif
Créer un module robuste et flexible pour exporter les métadonnées liées aux unités d'organisation (Unités, Groupes, GroupSets) au format JSON, en vue d'un transfert vers une autre instance DHIS2.

## Fonctionnalités Clés
1.  **Sélection des Types d'Entités**
    - L'utilisateur peut choisir d'inclure :
        - Organisation Units (Unités d'organisation)
        - Organisation Unit Groups (Groupes)
        - Organisation Unit Group Sets (Ensembles de groupes)

2.  **Sélection des Champs (Colonnes)**
    - Pour chaque type d'entité sélectionné, l'utilisateur peut choisir précisément les champs à exporter (ex: `id`, `name`, `code`, `geometry`, `parent`, etc.).
    - Presets disponibles : "Minimal" (pour transfert) vs "Complet".

3.  **Filtrage (Scope)**
    - Possibilité de filtrer les unités d'organisation (ex: tout le système, ou à partir d'une racine spécifique).

4.  **Format de Sortie**
    - **JSON** uniquement (format natif DHIS2 metadata).
    - Structure compatible avec l'import de métadonnées DHIS2.

## Architecture Technique

### Frontend (`export-metadata-orgunits.html`)
- **Step 1 : Configuration du Scope & Entités**
    - Checkboxes pour OrgUnits, Groups, GroupSets.
    - Sélecteur de racine (Root) optionnel.
- **Step 2 : Sélection des Champs**
    - Affichage dynamique de listes de cases à cocher pour chaque entité sélectionnée à l'étape 1.
- **Step 3 : Prévisualisation & Export**
    - Résumé du nombre d'objets à exporter.
    - Bouton "Télécharger JSON".

### Backend
- Utilisation du `dhis2-session-manager.js` et du proxy existant.
- Requêtes API :
    - `/api/organisationUnits`
    - `/api/organisationUnitGroups`
    - `/api/organisationUnitGroupSets`

## Champs Disponibles (Suggestion)
- **Organisation Unit**: `id`, `name`, `shortName`, `code`, `description`, `openingDate`, `closedDate`, `comment`, `geometry`, `parent`, `url`, `contactPerson`, `address`, `email`, `phoneNumber`.
- **Org Unit Group**: `id`, `name`, `shortName`, `code`, `description`, `groupSet`.
- **Org Unit Group Set**: `id`, `name`, `shortName`, `code`, `description`, `compulsory`, `includeSubhierarchyInAnalytics`.

## Étapes d'Implémentation
1.  Créer `export-metadata-orgunits.html` (Basé sur le template standard).
2.  Créer `js/export-metadata-orgunits.js`.
3.  Ajouter le module à `index.html`.
