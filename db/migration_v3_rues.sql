-- COSSIM : référentiel des voies pour l'autocomplétion de l'adresse du sinistre.
-- Exécuter une fois sur Neon pour une base existante.

CREATE TABLE IF NOT EXISTS rues (
  id              SERIAL PRIMARY KEY,
  type_voie       VARCHAR(50),
  nom             VARCHAR(255) NOT NULL,
  commune         VARCHAR(100),
  arrondissement  VARCHAR(100),
  code_postal     VARCHAR(10),
  actif           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rues_nom_lower
  ON rues (LOWER(nom));

CREATE INDEX IF NOT EXISTS idx_rues_commune
  ON rues (commune);

-- Exemples facultatifs : à supprimer/remplacer par tes propres rues.
-- INSERT INTO rues (type_voie, nom, commune, arrondissement, code_postal)
-- VALUES ('Rue', 'de la République', 'Marseille', '1er arrondissement', '13001');


-- Métadonnées de voie associées à l'adresse du sinistre.
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS arrondissement VARCHAR(100);
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS type_voie VARCHAR(50);
