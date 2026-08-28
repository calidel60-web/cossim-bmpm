-- COSSIM : liaison FiveM <-> matricule COSSIM pour le pilotage des statuts radio.
-- À exécuter UNE FOIS sur une base Neon existante.

BEGIN;

CREATE TABLE IF NOT EXISTS fivem_bindings (
  id             SERIAL PRIMARY KEY,
  identifier     VARCHAR(150) UNIQUE NOT NULL,
  fivem_name     VARCHAR(100),
  matricule      VARCHAR(20) NOT NULL REFERENCES personnel(matricule) ON DELETE CASCADE,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fivem_bindings_matricule
  ON fivem_bindings(matricule);

CREATE INDEX IF NOT EXISTS idx_fivem_bindings_identifier
  ON fivem_bindings(identifier);

COMMIT;
