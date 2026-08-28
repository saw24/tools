# Plan de Module : Import Métadonnées (Générique)

## Objectif
Créer un module unifié pour l'importation de métadonnées (Unités d'Organisation et Utilisateurs) à partir de fichiers Excel (XLSX) ou JSON.

## Fonctionnalités Clés
1.  **Sélection de la Source**
    - Upload de fichier `.json` ou `.xlsx`.
    - Détection automatique du format.
    - Sélection du type d'objet cible : `Organisation Unit` ou `User`.

2.  **Mapping des Colonnes (Spécifique Excel)**
    - Interface de mapping "Source Colonne" -> "Destination Champ DHIS2".
    - Algorithme de correspondance intelligente (Levenshtein).
    - Gestion des champs obligatoires (ex: `name`, `shortName`, `openingDate` pour OrgUnit; `firstName`, `surname`, `username` pour User).
    - *Pour JSON* : Mapping ignoré ou validation de structure uniquement.

3.  **Dry Run (Simulation)**
    - Validation des données avant envoi.
    - **Org Units** : Vérification des parents, unicité des IDs/Codes.
    - **Users** : Vérification des usernames, unicité, format email.
    - Génération d'un rapport d'erreurs/conflits potentiels.

4.  **Importation**
    - Envoi par paquets (batching) pour éviter les timeouts.
    - Utilisation de l'endpoint `/api/metadata` (atomique) ou endpoints spécifiques selon le cas (Stratégie `CREATE_AND_UPDATE` préférée).

## Architecture Technique

### Frontend (`import-metadata.html`)
- **Wizard 4 Étapes** :
    1.  **Source & Type** : Upload fichier + Choix entité.
    2.  **Mapping** : Tableau de correspondance (visible si Excel).
    3.  **Simulation** : Lancement du Dry Run et affichage des logs.
    4.  **Import** : Exécution réelle et rapport final.

### Backend Logic (`import-metadata.js`)
- **Parsing** : `SheetJS` pour Excel, `JSON.parse` pour JSON.
- **Mapping Config** :
    - Définition des schémas d'attributs pour chaque entité (OrgUnit, User).
- **Validation** :
    - Règles spécifiques par type d'entité.
- **API** :
    - `POST /api/metadata?importStrategy=CREATE_AND_UPDATE` (Idéal pour JSON standard).
    - Ou construction manuelle des payloads pour Excel.

## Schémas de Mapping Supportés

### Organisation Unit
- `name` (Requis)
- `shortName` (Requis)
- `openingDate` (Requis)
- `parent` (UID ou Code ou Nom -> tentative de résolution)
- `id` (Optionnel, pour update)

### User
- `firstName`, `surname`, `email`
- `username` (Requis)
- `password` (Si dispo/autorisé)
- `userRoles` (Liste séparée par virgules)
- `userGroups` (Liste séparée par virgules)
- `organisationUnits` (Liste séparée par virgules)

## Étapes d'Implémentation
1.  Créer `MODULE_IMPORT_METADATA.md` (Ce fichier).
2.  Créer `import-metadata.html` (Basé sur le design existant).
3.  Créer `js/import-metadata.js`.
4.  Mettre à jour `index.html`.
