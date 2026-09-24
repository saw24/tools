<?php
/**
 * Catalogue canonique des modules de l'application DHIS2 Tools.
 *
 * C'est la source de vérité utilisée par api/stats.php (action=init) pour peupler
 * et mettre à jour la table t_modules : grâce à ce catalogue, le tableau de bord
 * Statistiques connaît TOUS les modules de l'application, y compris ceux qui n'ont
 * encore jamais été visités (sinon ils resteraient invisibles des statistiques
 * tant que personne n'a cliqué dessus).
 *
 * ⚠️ Pensez à ajouter une ligne ici — et une carte correspondante dans
 * index.html — à chaque nouveau module (nouvelle page .html) créé.
 *
 * Ce fichier est la source ; migrations/2026-08-31_init_schema.sql en contient un
 * instantané SQL équivalent pour un déploiement sans PHP en amont. En cas de
 * divergence entre les deux, ce fichier fait foi (relancez `?action=init` pour
 * resynchroniser la base).
 */

function dhis2ToolsModuleCatalog()
{
    return array(
        array('path' => 'index.html', 'name' => 'Tableau de Bord (Index)', 'category' => 'Accueil', 'icon' => 'fa-home'),

        // Export
        array('path' => 'export-data-elements.html', 'name' => 'Export Éléments de Données', 'category' => 'Export', 'icon' => 'fa-download'),
        array('path' => 'export-data-elements-dependencies.html', 'name' => 'Export Éléments + Dépendances', 'category' => 'Export', 'icon' => 'fa-file-export'),
        array('path' => 'export-category-combos.html', 'name' => 'Export CategoryCombos + Dépendances', 'category' => 'Export', 'icon' => 'fa-file-export'),
        array('path' => 'export-form-dependencies.html', 'name' => 'Export Formulaire + Dépendances', 'category' => 'Export', 'icon' => 'fa-file-export'),
        array('path' => 'export-organisation-units.html', 'name' => 'Export Unités d\'Organisation', 'category' => 'Export', 'icon' => 'fa-sitemap'),
        array('path' => 'export-metadata-orgunits.html', 'name' => 'Export Métadonnées Organisation', 'category' => 'Export', 'icon' => 'fa-sitemap'),
        array('path' => 'export-users.html', 'name' => 'Export Utilisateurs', 'category' => 'Export', 'icon' => 'fa-users'),
        array('path' => 'export-data-values.html', 'name' => 'Export Valeurs de Données', 'category' => 'Export', 'icon' => 'fa-file-export'),

        // Import
        array('path' => 'excel-import-dhis2.html', 'name' => 'Import Excel vers DHIS2', 'category' => 'Import', 'icon' => 'fa-file-import'),
        array('path' => 'import-orgunits.html', 'name' => 'Import Unités d\'Organisation', 'category' => 'Import', 'icon' => 'fa-sitemap'),
        array('path' => 'import-users.html', 'name' => 'Import Utilisateurs', 'category' => 'Import', 'icon' => 'fa-user-plus'),
        array('path' => 'import-metadata.html', 'name' => 'Import Métadonnées', 'category' => 'Import', 'icon' => 'fa-file-import'),
        array('path' => 'import-indicators-dependencies.html', 'name' => 'Import Indicateurs + Dépendances', 'category' => 'Import', 'icon' => 'fa-percentage'),

        // Analyse
        array('path' => 'geo-analysis.html', 'name' => 'Analyse Géo-Interactive', 'category' => 'Analyse', 'icon' => 'fa-map-location-dot'),
        array('path' => 'descendant-structures-filter.html', 'name' => 'Structures sans Groupe', 'category' => 'Analyse', 'icon' => 'fa-filter'),
        array('path' => 'advanced-structures-filter.html', 'name' => 'Filtre Structures', 'category' => 'Analyse', 'icon' => 'fa-filter'),
        array('path' => 'map-visualizer.html', 'name' => 'Visualisation Cartographique', 'category' => 'Analyse', 'icon' => 'fa-map-marked-alt'),
        array('path' => 'data-analysis.html', 'name' => 'Import table d\'une BD', 'category' => 'Analyse', 'icon' => 'fa-database'),

        // Suppression
        array('path' => 'delete-data-values.html', 'name' => 'Suppression DataValues', 'category' => 'Suppression', 'icon' => 'fa-trash-alt'),
        array('path' => 'delete-tracker-records.html', 'name' => 'Suppression Tracker', 'category' => 'Suppression', 'icon' => 'fa-user-slash'),

        // Gestion
        array('path' => 'data-approvals.html', 'name' => 'Approbation des Données', 'category' => 'Gestion', 'icon' => 'fa-check-double'),
        array('path' => 'data-migration.html', 'name' => 'Migration entre Éléments de Données', 'category' => 'Gestion', 'icon' => 'fa-exchange-alt'),

        // Utilitaire
        array('path' => 'excel-mapping.html', 'name' => 'Excel Colonne Mapping', 'category' => 'Utilitaire', 'icon' => 'fa-table-columns'),
        array('path' => 'expression-calculator.html', 'name' => 'Calculateur d\'Expression DHIS2', 'category' => 'Utilitaire', 'icon' => 'fa-calculator'),
    );
}
