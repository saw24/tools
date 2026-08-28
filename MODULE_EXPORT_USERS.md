# Plan de Module : Export Utilisateurs

## Objectif
Créer un module pour exporter les utilisateurs et leurs entités liées (Groupes, Rôles) afin de faciliter la gestion, l'audit ou le transfert vers une autre instance.

## Fonctionnalités Clés
1.  **Sélection des Entités**
    - Users (Utilisateurs)
    - User Groups (Groupes d'utilisateurs)
    - User Roles (Rôles d'utilisateurs)

2.  **Sélection des Champs**
    - Choix granulaire des champs pour chaque entité.
    - Inclusion spécifique de `userCredentials` (Nom d'utilisateur, Mot de passe haché*, Rôles).
    - Inclusion des unités d'organisation (`organisationUnits`).

3.  **Format d'Export**
    - JSON (Structure native DHIS2 pour import direct).

## Architecture Technique

### Frontend (`export-users.html`)
- Wizard en 3 étapes (similaire à Org Units Export).
- **Step 1**: Checkboxes pour Users, User Groups, User Roles.
- **Step 2**: Configuration des champs.
    - Champs Utilisateur : `firstName`, `surname`, `email`, `userCredentials`...
    - *Note sur le mot de passe* : Il sera inclus via `userCredentials.password` si l'API le permet (Permissions admin requises).
- **Step 3**: Génération et téléchargement.

### Backend (Client-Side Logic)
- **API Call**:
    - `/api/users`
    - `/api/userGroups`
    - `/api/userRoles`
- **Payload Construction**:
    - Assemblage d'un objet JSON `{ "users": [], "userGroups": [], "userRoles": [] }`.

## Champs Suggérés
- **Users**:
    - Identité: `id`, `firstName`, `surname`, `email`, `phoneNumber`.
    - Credentials: `userCredentials[username,password,disabled,userRoles]`.
    - Org Units: `organisationUnits`, `dataViewOrganisationUnits`.
    - Groups: `userGroups`.
- **User Groups**: `id`, `name`, `users`.
- **User Roles**: `id`, `name`, `authorities`.

## Implementation Steps
1.  Créer `export-users.html`.
2.  Créer `js/export-users.js`.
3.  Mettre à jour `index.html`.
