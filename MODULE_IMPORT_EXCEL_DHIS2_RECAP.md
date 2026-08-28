# Récapitulatif : Module d'Import Excel vers DHIS2

## Vue d'ensemble
Un nouveau module a été créé pour permettre aux utilisateurs d'importer des données depuis des fichiers Excel vers DHIS2. Ce module intègre une génération de template, un mapping intelligent assisté par l'IA (Levenshtein), une validation préalable (Dry Run) et l'import final.

## Fichiers Créés / Modifiés

1.  **`excel-import-dhis2.html`** (Nouveau)
    - Interface utilisateur complète avec 4 étapes (Sélection, Upload, Mapping, Validation).
    - Intégration du design system existant (Glassmorphism, Animations).
    
2.  **`js/excel-import-dhis2.js`** (Nouveau)
    - **Step 1**: Chargement dynamiques des DataSets DHIS2 et génération de template Excel (`SheetJS`) incluant les colonnes nécessaires (OrgUnit, Period, Data Elements).
    - **Step 2**: Lecture du fichier Excel uploadé côté client.
    - **Step 3**: Algorithme de mapping intelligent qui suggère automatiquement les correspondances entre les colonnes Excel et les Data Elements / CategoryOptionCombos via distance de Levenshtein. UI permettant l'ajustement manuel.
    - **Step 4**: Simulation ("Dry Run") pour valider les formats (UIDs) et la présence des données avant l'envoi réel. Fonction d'import final via l'API DHIS2 (`/api/dataValueSets`).

3.  **`index.html`** (Modifié)
    - Ajout de la carte du module "Import Excel vers DHIS2" dans le tableau de bord principal.

4.  **`MODULE_IMPORT_EXCEL_DHIS2.md`** (Nouveau)
    - Plan d'implémentation initial.

## Fonctionnalités Clés Implémentées

- **Connexion DHIS2**: Utilise le module d'authentification existant.
- **Génération de Template**: Crée un fichier `.xlsx` personnalisé pour le formulaire choisi, facilitant la saisie pour l'utilisateur.
- **Mapping Intelligent**: Détecte automatiquement les colonnes "Organisation Unit" et "Période", et tente de mapper les colonnes de données par similarité de nom.
- **Validation**: Vérifie basiquement les IDs et la structure avant l'envoi pour éviter les erreurs 409/500 du serveur.
- **Feedback Utilisateur**: Utilisation de Toasts et de barres de progression pour une bonne UX.

## Instructions de Test
1.  Se connecter à DHIS2 via le bouton en haut à droite.
2.  Ouvrir le module "Import Excel vers DHIS2".
3.  Sélectionner un formulaire (DataSet).
4.  Télécharger le modèle et y ajouter quelques données de test.
5.  Uploader le fichier.
6.  Vérifier que le mapping automatique a bien fonctionné (les colonnes devraient être vertes).
7.  Lancer le Dry Run et vérifier les logs.
8.  Cliquer sur "Importer" pour envoyer les données.
