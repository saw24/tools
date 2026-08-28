# Plan de Module : Import Excel vers DHIS2

## Objectif
Créer un module permettant d'importer des données depuis un fichier Excel vers DHIS2, avec une étape de mapping intelligente et une validation (dry-run).

## Fonctionnalités Clés
1. **Sélection du Formulaire DHIS2**
   - L'utilisateur sélectionne un "DataSet" (Formulaire) ou un "Program" (Tracker - Optionnel pour V1) depuis l'instance connectée.

2. **Téléchargement du Template**
   - Génération dynamique d'un fichier Excel modèle basé sur le formulaire sélectionné.
   - Les colonnes correspondront aux Data Elements / Attributes + Organisation Unit + Period.

3. **Upload et Mapping**
   - L'utilisateur upload son fichier Excel rempli.
   - Le système tente de mapper automatiquement les colonnes Excel aux Data Elements DHIS2 (basé sur le nom ou le code).
   - Interface de mapping manuel pour corriger ou compléter les correspondances.

4. **Dry Run (Simulation)**
   - Validation des données sans import réel.
   - Vérification des types de données, des Organisation Units valides, des Périodes valides.
   - Rapport d'erreurs potentielles.

5. **Import**
   - Envoi des données vers l'API DHIS2 (ex: `/api/dataValueSets` pour les DataSets).

## Architecture Technique

### Frontend (`excel-import-dhis2.html`)
- **Libaries Used**:
    - `SheetJS` (xlsx) pour lire/écrire l'Excel coté client.
    - `jQuery` pour la logique UI.
    - `Select2` pour les listes déroulantes.
    - `DHIS2 Auth` (existant) pour la connexion.

### Backend (`api/import_dhis2.php` - si nécessaire)
- Le gros du travail peut être fait en JS (Client-side) pour lire l'Excel et préparer le JSON pour DHIS2.
- Cependant, pour éviter les problèmes de CORS/Proxy, on utilisera probablement le proxy PHP existant (`api/proxy.php` ou similaire si disponible, sinon on étendra la logique existante).
- **Note**: Si l'instance DHIS2 est sur un autre domaine sans CORS, on devra passer par un proxy PHP.

## Interface Utilisateur (UI)
- **Step 1**: Connexion & Sélection (DataSet). Bouton "Télécharger Template".
- **Step 2**: Upload Fichier rempli.
- **Step 3**: Mapping des Colonnes (Tableau: Colonne Excel | Data Element DHIS2 | Type | Exemple).
- **Step 4**: Validation / Dry Run (Barre de progression, Log d'erreurs).
- **Step 5**: Import final.

## Étapes d'Implémentation
1.  Créer `excel-import-dhis2.html` sur la base du template `index.html`.
2.  Implémenter la logique de récupération des DataSets (`api/dhis2/datasets`).
3.  Implémenter la génération de template Excel.
4.  Implémenter le mapping UI.
5.  Implémenter le Dry Run et l'Import.
