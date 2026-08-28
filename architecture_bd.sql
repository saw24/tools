-- Création de la table des statistiques de modules
CREATE TABLE module_stats (
    id SERIAL PRIMARY KEY,
    module_name VARCHAR(255) NOT NULL,
    module_path VARCHAR(255) NOT NULL,
    visit_count INTEGER DEFAULT 1,
    last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Contrainte d'unicité sur le chemin pour gérer les doublons via ON CONFLICT
    CONSTRAINT unique_module_path UNIQUE (module_path)
);

-- Index pour accélérer le tri par nombre de visites
CREATE INDEX idx_module_stats_visits ON module_stats (visit_count DESC);

-- Commentaire de table
COMMENT ON TABLE module_stats IS 'Table de suivi de l''utilisation des modules par nombre de visites';