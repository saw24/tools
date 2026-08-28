# Module Export des Unités d'Organisation

Ce document décrit le nouveau module d'export des Unités d'Organisation pour la suite d'outils DHIS2.

## 📋 Description

Ce module permet d'exporter les unités d'organisation (Organisation Units) depuis une instance DHIS2 vers un fichier Excel (XLSX). Il est conçu pour faciliter l'extraction de métadonnées géographiques et hiérarchiques pour des analyses hors ligne ou des migrations.

## ✨ Fonctionnalités

1.  **Export vers Excel (XLSX), GeoJSON et GPKG**
    *   **Excel** : Fichier standard pour tableurs. *Colonne "Contours (JSON)" tronquée à 32k caractères.*
    *   **GeoJSON** : Format SIG standard, incluant toutes les géométries sans limite.
    *   **GPKG** : (Expérimental) Redirection vers GeoJSON pour compatibilité maximale.
    *   Aucune limite stricte sur le nombre d'unités.

2.  **Données exportées**
    *   **ID** : Identifiant unique (UID) de l'unité.
    *   **Nom** : Nom d'affichage.
    *   **Latitude / Longitude** : Coordonnées (WGS84) pour les Points.
    *   **Contours (JSON)** : Géométrie complète (GeoJSON Geometry Object) pour Points et Polygones.
    *   **Ancêtres** : Hiérarchie complète (ex: `Pays > Région`).
    *   **Groupes** : Groupes d'appartenance.

3.  **Filtrage Avancé** (Avant export)
    *   **Par Groupe** : Sélectionner un groupe spécifique.
    *   **Par Nom** : Filtrer par nom (Contient, Égal à, Commence par).
    *   **Par Liste d'IDs** : Fournir une liste d'UIDs.
    *   **Tout exporter** : Récupérer l'intégralité.

4.  **Prévisualisation**
    *   Aperçu des 50 premiers résultats avec géométries et groupes.

## 🛠 Architecture Technique

### Frontend (`export-organisation-units.html`)
*   **Technologies** : HTML5, CSS3, jQuery.
*   **Bibliothèques** :
    *   `SheetJS` (`xlsx.full.min.js`) pour la génération du fichier Excel côté client.
    *   `FontAwesome` pour les icônes.
*   **Logique** :
    *   Authentification gérée par `dhis2-session-manager.js`.
    *   Processus en deux étapes :
        1.  **Extraction** : Appel AJAX au backend PHP avec les critères de filtre.
        2.  **Prévisualisation** : Affichage des données reçues dans un tableau HTML.
        3.  **Export** : Génération du fichier Excel à partir des données en mémoire.

### Backend (`api/export-organisation-units.php`)
*   **Rôle** : Proxy intelligent vers l'API DHIS2.
*   **Authentification** : Utilise les credentials transmis par le frontend (Basic Auth).
*   **Traitement** :
    *   Reçoit les paramètres de filtre (`filterType`, `nameValue`, `groupId`, etc.).
    *   Construit la requête API DHIS2 correspondante avec les filtres server-side (`filter=...`).
    *   Récupère les champs nécessaires : `id`, `displayName`, `geometry`, `ancestors`, `organisationUnitGroups`.
    *   Formate les données (extraction Lat/Lon, aplatissement des ancêtres et groupes) avant de les renvoyer au frontend.

### Flux de Données
1.  Utilisateur se connecte à DHIS2 (via `index.html` ou le header).
2.  Utilisateur sélectionne un filtre (ex: Groupe "Hôpitaux").
3.  Frontend appelle `api/export-organisation-units.php?action=export` avec les paramètres.
4.  Backend appelle DHIS2 `/api/organisationUnits?filter=...`.
5.  Backend traite la réponse JSON de DHIS2 et la renvoie au frontend.
6.  Frontend affiche l'aperçu.
7.  Utilisateur clique sur "Télécharger".
8.  Frontend génère le fichier `.xlsx` via SheetJS.

## 🚀 Utilisation

1.  Accéder à l'outil via la page d'accueil (carte "Export Unités d'Organisation").
2.  Vérifier la connexion DHIS2 (coin supérieur droit).
3.  Choisir un type de filtre :
    *   **Par groupe** : Idéal pour exporter un type spécifique de structure (ex: Centres de Santé).
    *   **Par nom** : Pour trouver des unités spécifiques.
    *   **Tout exporter** : Pour une sauvegarde complète.
4.  Cliquer sur **"Lancer l'extraction"**.
5.  Vérifier le tableau de prévisualisation.
6.  Cliquer sur **"Télécharger le fichier Excel"**.

## ⚠️ Limitations connues
*   La performance pour "Tout exporter" dépend de la taille de la base DHIS2. Pour de très grosses instances (> 10 000 unités), l'export peut prendre quelques secondes.
*   Seules les géométries de type "Point" sont décomposées en Latitude/Longitude. Les Polygones sont indiqués comme tels ("Polygon: X points") dans la colonne Géométrie originale (non affichée dans la table de prévisualisation mais présente dans l'Excel si on l'ajoutait, pour l'instant Lat/Lon sont privilégiés). *Note : Le code actuel exporte Lat/Lon séparément.*
