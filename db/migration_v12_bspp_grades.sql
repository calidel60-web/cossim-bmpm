-- CO BSPP : passage des grades BMPM (marine) aux grades de la Brigade de
-- Sapeurs-Pompiers de Paris. À exécuter UNE FOIS sur la base Neon existante.
--
-- Le personnel et les seuils de fonctions (ex. chef d'agrès) sont convertis
-- au grade équivalent par ordre hiérarchique (MO2 -> Sapeur 2e classe, etc.).
-- Les grades que tu avais ajoutés toi-même ne sont pas touchés.

BEGIN;

INSERT INTO grades (code, libelle, ordre) VALUES
  ('S2C','Sapeur 2e classe',10),
  ('S1C','Sapeur 1re classe',20),
  ('CPL','Caporal',30),
  ('CCH','Caporal-chef',40),
  ('SGT','Sergent',50),
  ('SCH','Sergent-chef',60),
  ('ADJ','Adjudant',70),
  ('ADC','Adjudant-chef',80),
  ('MAJ','Major',90),
  ('SLT','Sous-lieutenant',100),
  ('LTN','Lieutenant',110),
  ('CNE','Capitaine',120),
  ('CDT','Commandant',130),
  ('LCL','Lieutenant-colonel',140),
  ('COL','Colonel',150),
  ('GBR','Général de brigade',160)
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, ordre = EXCLUDED.ordre;

CREATE TEMP TABLE grade_map (old_code VARCHAR(20), new_code VARCHAR(20)) ON COMMIT DROP;
INSERT INTO grade_map VALUES
  ('MO2','S2C'),
  ('MO1','S1C'),
  ('QM2','CPL'),
  ('QM1','CCH'),
  ('SM','SGT'),
  ('MT','SCH'),
  ('PM','ADJ'),
  ('MP','ADC'),
  ('MJR','MAJ'),
  ('EV2','SLT'),
  ('EV1','LTN'),
  ('LV','CNE');

UPDATE personnel p SET grade_code = m.new_code
FROM grade_map m WHERE p.grade_code = m.old_code;

UPDATE fonctions f SET seuil_grade_code = m.new_code
FROM grade_map m WHERE f.seuil_grade_code = m.old_code;

DELETE FROM grades WHERE code IN (SELECT old_code FROM grade_map);

COMMIT;
