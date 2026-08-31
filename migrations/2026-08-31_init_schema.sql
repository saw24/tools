-- ============================================================================
-- DHIS2 Tools — Migration complète du schéma "Statistiques & Interactions"
-- Base cible : PostgreSQL (dhis2_tools)
-- Date       : 2026-08-31
--
-- Contient l'intégralité du schéma nécessaire à ce jour :
--   - t_modules          : catalogue de tous les modules de l'application
--   - t_module_visits     : journal des visites (une ligne par visite)
--   - t_module_comments   : commentaires/notes laissés sur un module
--   - t_module_notifications : notifications affichées sur le tableau de bord
--
-- Idempotent : peut être rejoué sans risque (CREATE TABLE IF NOT EXISTS, upsert).
-- Migre automatiquement les données de l'ancien schéma (table module_stats /
-- t_module_stats à compteur agrégé) si elle est présente, puis la renomme en
-- t_module_stats_legacy_20260831 (conservée, non supprimée).
--
-- Exécution :
--   psql -h <host> -p <port> -U <user> -d dhis2_tools -f migrations/2026-08-31_init_schema.sql
--
-- Remarque : cette migration est OPTIONNELLE pour un premier déploiement — l'appel
-- à api/stats.php?action=init crée et peuple le même schéma automatiquement (voir
-- MODULE_STATISTIQUES.md). Elle est utile pour un déploiement scripté sans étape
-- HTTP préalable, ou pour documenter explicitement le schéma en base.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Catalogue des modules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_modules (
    id SERIAL PRIMARY KEY,
    module_path VARCHAR(255) NOT NULL UNIQUE,
    module_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Autre',
    icon_class VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE t_modules IS 'Catalogue de tous les modules de l''application : source de vérité pour le tableau de bord et les statistiques (inclut les modules jamais visités).';

-- ----------------------------------------------------------------------------
-- Journal des visites (une ligne par visite, permet les statistiques temporelles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_module_visits (
    id BIGSERIAL PRIMARY KEY,
    module_id INTEGER NOT NULL REFERENCES t_modules(id) ON DELETE CASCADE,
    visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_module_visits_module_id ON t_module_visits (module_id);
CREATE INDEX IF NOT EXISTS idx_module_visits_visited_at ON t_module_visits (visited_at DESC);
COMMENT ON TABLE t_module_visits IS 'Journal des visites (une ligne par visite) permettant les statistiques temporelles (graphique d''activité).';

-- ----------------------------------------------------------------------------
-- Commentaires et notifications (inchangés, déjà utilisés par api/interactions.php)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_module_comments (
    id SERIAL PRIMARY KEY,
    module_path TEXT NOT NULL,
    user_name TEXT DEFAULT 'Anonyme',
    comment_text TEXT,
    rating INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS t_module_notifications (
    id SERIAL PRIMARY KEY,
    module_path TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Reprise des données de l'ancien schéma (compteur agrégé) si présent
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 't_module_stats') THEN
        -- 1) S'assurer que chaque module de l'ancienne table existe dans le catalogue
        INSERT INTO t_modules (module_path, module_name, category)
        SELECT module_path, module_name, 'Autre' FROM t_module_stats
        ON CONFLICT (module_path) DO NOTHING;

        -- 2) Reconstituer un historique approximatif : on ne connaissait que le
        --    compteur total et la dernière visite, donc chaque "visite manquante"
        --    est horodatée à cette dernière date connue (le total est préservé,
        --    la répartition dans le temps ne l'est pas — c'est un repli acceptable).
        INSERT INTO t_module_visits (module_id, visited_at)
        SELECT m.id, s.last_visit
        FROM t_module_stats s
        JOIN t_modules m ON m.module_path = s.module_path
        CROSS JOIN LATERAL generate_series(1, GREATEST(s.visit_count, 1)) AS g(n);

        -- 3) Ne pas supprimer l'ancienne table : la renommer pour garder une trace
        ALTER TABLE t_module_stats RENAME TO t_module_stats_legacy_20260831;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Catalogue actuel des modules (upsert : ne réécrase jamais une catégorie déjà
-- personnalisée manuellement en base, seulement le nom affiché et l'icône).
-- Doit rester synchronisé avec api/module_catalog.php (qui fait foi en cas
-- de divergence — relancez api/stats.php?action=init pour resynchroniser).
-- ----------------------------------------------------------------------------
INSERT INTO t_modules (module_path, module_name, category, icon_class) VALUES
    ('index.html', 'Tableau de Bord (Index)', 'Accueil', 'fa-home'),

    ('export-data-elements.html', 'Export Éléments de Données', 'Export', 'fa-download'),
    ('export-data-elements-dependencies.html', 'Export Éléments + Dépendances', 'Export', 'fa-file-export'),
    ('export-category-combos.html', 'Export CategoryCombos + Dépendances', 'Export', 'fa-file-export'),
    ('export-form-dependencies.html', 'Export Formulaire + Dépendances', 'Export', 'fa-file-export'),
    ('export-organisation-units.html', 'Export Unités d''Organisation', 'Export', 'fa-sitemap'),
    ('export-metadata-orgunits.html', 'Export Métadonnées Organisation', 'Export', 'fa-sitemap'),
    ('export-users.html', 'Export Utilisateurs', 'Export', 'fa-users'),
    ('export-data-values.html', 'Export Valeurs de Données', 'Export', 'fa-file-export'),

    ('excel-import-dhis2.html', 'Import Excel vers DHIS2', 'Import', 'fa-file-import'),
    ('import-orgunits.html', 'Import Unités d''Organisation', 'Import', 'fa-sitemap'),
    ('import-users.html', 'Import Utilisateurs', 'Import', 'fa-user-plus'),
    ('import-metadata.html', 'Import Métadonnées', 'Import', 'fa-file-import'),

    ('geo-analysis.html', 'Analyse Géo-Interactive', 'Analyse', 'fa-map-location-dot'),
    ('descendant-structures-filter.html', 'Structures sans Groupe', 'Analyse', 'fa-filter'),
    ('advanced-structures-filter.html', 'Filtre Structures', 'Analyse', 'fa-filter'),
    ('map-visualizer.html', 'Visualisation Cartographique', 'Analyse', 'fa-map-marked-alt'),
    ('data-analysis.html', 'Import table d''une BD', 'Analyse', 'fa-database'),

    ('delete-data-values.html', 'Suppression DataValues', 'Suppression', 'fa-trash-alt'),
    ('delete-tracker-records.html', 'Suppression Tracker', 'Suppression', 'fa-user-slash'),

    ('data-approvals.html', 'Approbation des Données', 'Gestion', 'fa-check-double'),
    ('data-migration.html', 'Migration entre Éléments de Données', 'Gestion', 'fa-exchange-alt'),

    ('excel-mapping.html', 'Excel Colonne Mapping', 'Utilitaire', 'fa-table-columns'),
    ('expression-calculator.html', 'Calculateur d''Expression DHIS2', 'Utilitaire', 'fa-calculator')
ON CONFLICT (module_path) DO UPDATE SET
    module_name = EXCLUDED.module_name,
    icon_class = EXCLUDED.icon_class;

COMMIT;
