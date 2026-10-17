-- ============================================================
-- CO BSPP — migration v2
-- À exécuter une seule fois sur une base déjà créée avec schema.sql,
-- pour ajouter : les équivalences grade -> fonctions, et le planning
-- / feuille de garde. Idempotent (peut être relancé sans risque).
-- ============================================================

CREATE TABLE IF NOT EXISTS fonctions (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(30) UNIQUE NOT NULL,
  libelle           VARCHAR(150) NOT NULL,
  categorie         VARCHAR(20),
  seuil_grade_code  VARCHAR(20) REFERENCES grades(code),
  ordre             INT NOT NULL DEFAULT 0
);

INSERT INTO fonctions (code, libelle, categorie, seuil_grade_code, ordre) VALUES
  ('EQUI_CCF',     'Équipier CCF',              'CCF',  'S2C', 10),
  ('COND_CCF',     'Conducteur CCF',            'CCF',  NULL,  20),
  ('CA_CCF',       'Chef d''agrès CCF',         'CCF',  'SGT',  30),
  ('EQUI_VSAV',    'Équipier VSAV',             'VSAV', 'S2C', 40),
  ('COND_VSAV_VL', 'Conducteur VSAV / VL',      'VSAV', NULL,  50),
  ('CA_VSAV',      'Chef d''agrès VSAV',        'VSAV', 'SGT',  60),
  ('EQUI_VPI',     'Équipier VPI',              'VPI',  'S2C', 70),
  ('COND_VPI',     'Conducteur VPI',            'VPI',  'CPL', 80),
  ('CA_VPI',       'Chef d''agrès VPI',         'VPI',  'SGT',  90),
  ('COND_VL/HR',   'Conducteur VL / HR',        'VRCG', 'S2C', 100),
  ('CDG',          'Chef de groupe (VRCG)',     'VRCG', 'ADC',  110),
  ('CDC',          'Chef de colonne (VRCC)',    'VRCC', NULL,  120),
  ('COND_FI',      'Conducteur FI',             'FI',   'CPL', 130),
  ('CA_FI',        'Chef d''agrès FI',          'FI',   'SCH',  140),
  ('EQUI_BIN1',    'Équipier binôme 1 (FI)',    'FI',   'S2C', 150),
  ('CHEF_BIN1',    'Chef de binôme 1 (FI)',     'FI',   NULL,  160),
  ('EQUI_BIN2',    'Équipier binôme 2 (FI)',    'FI',   'S2C', 170),
  ('CHEF_BIN2',    'Chef de binôme 2 (FI)',     'FI',   NULL,  180),
  ('EQU_MEA',      'Équipier MEA',              'MEA',  'S2C', 190),
  ('COND_MEA',     'Conducteur MEA',            'MEA',  'CPL', 200),
  ('CA_MEA',       'Chef d''agrès MEA',         'MEA',  'SCH',  210),
  ('EQU_SR',       'Équipier CSR',              'CSR',  'S2C', 220),
  ('COND_SR',      'Conducteur CSR',            'CSR',  'CPL', 230),
  ('CA_SR',        'Chef d''agrès CSR',         'CSR',  'SCH',  240)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS planning_gardes (
  id            SERIAL PRIMARY KEY,
  date_garde    DATE NOT NULL,
  engin_id      INT NOT NULL REFERENCES engins(id) ON DELETE CASCADE,
  poste_code    VARCHAR(30) NOT NULL,
  personnel_id  INT REFERENCES personnel(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    VARCHAR(20),
  UNIQUE(date_garde, engin_id, poste_code)
);
CREATE INDEX IF NOT EXISTS idx_planning_date ON planning_gardes(date_garde);

-- Colonne motif sur les interventions (choisi dans la liste de motifs proposés côté front)
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS motif VARCHAR(150);
