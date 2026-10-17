-- CO (Centre Opérationnel) BMPM : centres de secours (casernes) et affectation des engins.
-- À exécuter UNE FOIS sur la base Neon existante.

BEGIN;

CREATE TABLE IF NOT EXISTS casernes (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10) UNIQUE NOT NULL,      -- ex. LVN
  nom         VARCHAR(80) NOT NULL,             -- ex. CIS LOUVAIN
  ordre       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE engins
  ADD COLUMN IF NOT EXISTS caserne_id INT REFERENCES casernes(id) ON DELETE SET NULL;

-- Reprise de l'existant : une caserne par valeur distincte de engins.caserne
INSERT INTO casernes (code, nom, ordre)
SELECT
  COALESCE(NULLIF(upper(substring(caserne from '([A-Za-z]{2,4})\s*$')), ''), 'C' || row_number() OVER (ORDER BY caserne)),
  caserne,
  (row_number() OVER (ORDER BY caserne)) * 10
FROM (SELECT DISTINCT caserne FROM engins WHERE caserne IS NOT NULL) d
ON CONFLICT (code) DO NOTHING;

UPDATE engins e SET caserne_id = c.id
FROM casernes c
WHERE e.caserne_id IS NULL AND c.nom = e.caserne;

CREATE INDEX IF NOT EXISTS idx_engins_caserne ON engins(caserne_id);

COMMIT;
