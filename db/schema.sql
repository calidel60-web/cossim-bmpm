-- ============================================================
-- COSSIM BMPM — schéma Postgres (Neon)
-- À exécuter une fois dans la console SQL de Neon (ou via psql)
-- ============================================================

-- Extension pour générer des UUID si besoin plus tard
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- GRADES (liste personnalisable)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grades (
  id       SERIAL PRIMARY KEY,
  code     VARCHAR(20) UNIQUE NOT NULL,
  libelle  VARCHAR(100) NOT NULL,
  ordre    INT NOT NULL DEFAULT 0
);

INSERT INTO grades (code, libelle, ordre) VALUES
  ('MO2','Matelot 2e classe',10),
  ('MO1','Matelot 1re classe',20),
  ('QM2','Quartier-maître 2e classe',30),
  ('QM1','Quartier-maître 1re classe',40),
  ('SM','Second-maître',50),
  ('MT','Maître',60),
  ('PM','Premier-maître',70),
  ('MP','Maître-principal',80),
  ('MJR','Major',90),
  ('EV2','Enseigne de vaisseau 2e classe',100),
  ('EV1','Enseigne de vaisseau 1re classe',110),
  ('LV','Lieutenant de vaisseau',120)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- PERSONNEL
-- role détermine les droits applicatifs :
--   agent          -> lecture seule sur synoptique / interventions
--   operateur_cta  -> peut créer/modifier interventions, éditer synoptique engins
--   admin          -> tout + gestion du personnel et des grades
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personnel (
  id            SERIAL PRIMARY KEY,
  matricule     VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom           VARCHAR(100) NOT NULL,
  grade_code    VARCHAR(20) NOT NULL REFERENCES grades(code),
  role          VARCHAR(20) NOT NULL DEFAULT 'agent'
                  CHECK (role IN ('agent','operateur_cta','admin')),
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ENGINS (synoptique)
-- statut : en_route | sur_les_lieux | message | message_urgent | transport_ch |
--          arrive_ch | disponible_radio | indisponible | rentre
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engins (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(50) UNIQUE NOT NULL,   -- "VSAV 01 LVN"
  categorie   VARCHAR(20),                    -- VSAV, FI, MEA, VPI, VRCG, VRCC, CCF, CCFS, CVGD, CDHR, CIBN, CSR, AR, FPMA
  caserne     VARCHAR(50) NOT NULL DEFAULT 'CIS LOUVAIN',
  statut      VARCHAR(30) NOT NULL DEFAULT 'disponible_radio'
                CHECK (statut IN ('en_route','sur_les_lieux','message','message_urgent',
                                  'transport_ch','arrive_ch','disponible_radio','indisponible','rentre')),
  ordre       INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  VARCHAR(20)
);

-- Liste initiale CIS Louvain (reprise de la fiche bilan VSAV)
INSERT INTO engins (nom, categorie, caserne, ordre) VALUES
  ('VSAV 01 LVN','VSAV','CIS LOUVAIN',10),
  ('VSAV 02 LVN','VSAV','CIS LOUVAIN',20),
  ('VSAV 03 LVN','VSAV','CIS LOUVAIN',30),
  ('VSAV 04 LVN','VSAV','CIS LOUVAIN',40),
  ('VSAV 05 LVN','VSAV','CIS LOUVAIN',50),
  ('FI 01 LVN','FI','CIS LOUVAIN',60),
  ('MEA 01 LVN','MEA','CIS LOUVAIN',70),
  ('VPI 01 LVN','VPI','CIS LOUVAIN',80),
  ('VRCG 01 LVN','VRCG','CIS LOUVAIN',90),
  ('VRCG 02 LVN','VRCG','CIS LOUVAIN',100),
  ('VRCG 03 LVN','VRCG','CIS LOUVAIN',110),
  ('VRCC 01 LVN','VRCC','CIS LOUVAIN',120),
  ('CCF 01 LVN','CCF','CIS LOUVAIN',130),
  ('CCF 02 LVN','CCF','CIS LOUVAIN',140),
  ('CCF 03 LVN','CCF','CIS LOUVAIN',150),
  ('CCF 04 LVN','CCF','CIS LOUVAIN',160),
  ('CCFS 01 LVN','CCFS','CIS LOUVAIN',170),
  ('CVGD 01 LVN','CVGD','CIS LOUVAIN',180),
  ('CDHR 01 LVN','CDHR','CIS LOUVAIN',190),
  ('CIBN 01 LVN','CIBN','CIS LOUVAIN',200),
  ('CSR 01 LVN','CSR','CIS LOUVAIN',210),
  ('AR 01 LVN','AR','CIS LOUVAIN',220),
  ('FPMA 01 LVN','FPMA','CIS LOUVAIN',230)
ON CONFLICT (nom) DO NOTHING;

-- ------------------------------------------------------------
-- SERVICES DE RÉFÉRENCE (services prévenus, liste fixe)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services_reference (
  id    SERIAL PRIMARY KEY,
  nom   VARCHAR(100) UNIQUE NOT NULL,
  ordre INT NOT NULL DEFAULT 0
);

INSERT INTO services_reference (nom, ordre) VALUES
  ('POLICE/GENDARMERIE',10),
  ('SAMU 15',20),
  ('RESEAU ENEDIS',30),
  ('RESEAU GRDF',40),
  ('AUTORITES',50),
  ('ELUS',60),
  ('SIPDC',70),
  ('DIR',80),
  ('VOIRIE',90),
  ('PREFECTURE',100),
  ('ASTREINTE SSSO - SSSM',110),
  ('CHEF DE GROUPEMENT',120),
  ('CHEF DE SITE',130),
  ('CHEF DE COLONNE',140),
  ('COZ',150),
  ('CHEF DE SALLE',160),
  ('SNCF RESEAU',170)
ON CONFLICT (nom) DO NOTHING;

-- ------------------------------------------------------------
-- RÉFÉRENTIEL DES VOIES / ADRESSES
-- À compléter avec les rues, avenues, boulevards, etc. de la zone couverte.
-- ------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_rues_nom_lower ON rues (LOWER(nom));
CREATE INDEX IF NOT EXISTS idx_rues_commune ON rues (commune);

-- ------------------------------------------------------------
-- INTERVENTIONS (CTA / INTER)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interventions (
  id           SERIAL PRIMARY KEY,
  motif        VARCHAR(150),
  sinistre     VARCHAR(150),
  observation  TEXT,
  adresse      VARCHAR(200),
  commune      VARCHAR(100),
  arrondissement VARCHAR(100),
  type_voie     VARCHAR(50),
  etare        VARCHAR(100),
  consignes    TEXT,
  appelant     VARCHAR(100),
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  statut       VARCHAR(20) NOT NULL DEFAULT 'en_cours'
                 CHECK (statut IN ('en_cours','cloturee')),
  created_by   VARCHAR(20) REFERENCES personnel(matricule),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Services prévenus pour une intervention donnée
CREATE TABLE IF NOT EXISTS intervention_services (
  intervention_id  INT NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  service_id       INT NOT NULL REFERENCES services_reference(id),
  heure_prevenu    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (intervention_id, service_id)
);

-- Engagement de moyens (engins affectés à une intervention)
CREATE TABLE IF NOT EXISTS intervention_engins (
  id                SERIAL PRIMARY KEY,
  intervention_id   INT NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  engin_id          INT NOT NULL REFERENCES engins(id),
  heure_engagement  TIMESTAMPTZ NOT NULL DEFAULT now(),
  heure_disponible  TIMESTAMPTZ,
  etat              VARCHAR(30) NOT NULL DEFAULT 'en_route'
                       CHECK (etat IN ('en_route','sur_les_lieux','message','message_urgent',
                                       'transport_ch','arrive_ch','disponible_radio','indisponible','rentre')),
  UNIQUE(intervention_id, engin_id)
);

CREATE INDEX IF NOT EXISTS idx_interventions_statut ON interventions(statut);
CREATE INDEX IF NOT EXISTS idx_intervention_engins_inter ON intervention_engins(intervention_id);
CREATE INDEX IF NOT EXISTS idx_engins_statut ON engins(statut);

-- ------------------------------------------------------------
-- MAIN COURANTE — historique des messages d'une intervention
-- (engagements avec équipage, changements d'état des engins, et
-- messages radio retransmis manuellement par le CTA).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intervention_messages (
  id                SERIAL PRIMARY KEY,
  intervention_id   INT NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  auteur            VARCHAR(100) NOT NULL,
  contenu           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_messages_inter
  ON intervention_messages(intervention_id, created_at);

-- ------------------------------------------------------------
-- FONCTIONS (équivalences grade -> fonctions)
-- Chaque fonction est rattachée à une catégorie d'engin (CA_x = chef
-- d'agrès, COND_x = conducteur, EQUI_x/EQU_x = équipier, CHEF_BINx /
-- EQUI_BINx = binômes FI, CDG/CDC = chef de groupe/colonne).
-- seuil_grade_code = grade MINIMUM à partir duquel la fonction est acquise.
-- En montant en grade, on garde toutes les fonctions des seuils inférieurs
-- (calcul par comparaison de l'ordre des grades, voir netlify/functions/personnel.js)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fonctions (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(30) UNIQUE NOT NULL,
  libelle           VARCHAR(150) NOT NULL,
  categorie         VARCHAR(20),                 -- catégorie d'engin concernée (VSAV, FI, MEA, VPI, VRCG, VRCC, CCF, CSR...)
  seuil_grade_code  VARCHAR(20) REFERENCES grades(code),
  ordre             INT NOT NULL DEFAULT 0
);

INSERT INTO fonctions (code, libelle, categorie, seuil_grade_code, ordre) VALUES
  ('EQUI_CCF',     'Équipier CCF',              'CCF',  'MO2', 10),
  ('COND_CCF',     'Conducteur CCF',            'CCF',  NULL,  20),
  ('CA_CCF',       'Chef d''agrès CCF',         'CCF',  'SM',  30),
  ('EQUI_VSAV',    'Équipier VSAV',             'VSAV', 'MO2', 40),
  ('COND_VSAV_VL', 'Conducteur VSAV / VL',      'VSAV', NULL,  50),
  ('CA_VSAV',      'Chef d''agrès VSAV',        'VSAV', 'SM',  60),
  ('EQUI_VPI',     'Équipier VPI',              'VPI',  'MO2', 70),
  ('COND_VPI',     'Conducteur VPI',            'VPI',  'QM2', 80),
  ('CA_VPI',       'Chef d''agrès VPI',         'VPI',  'SM',  90),
  ('COND_VL/HR',   'Conducteur VL / HR',        'VRCG', 'MO2', 100),
  ('CDG',          'Chef de groupe (VRCG)',     'VRCG', 'MP',  110),
  ('CDC',          'Chef de colonne (VRCC)',    'VRCC', NULL,  120),
  ('COND_FI',      'Conducteur FI',             'FI',   'QM2', 130),
  ('CA_FI',        'Chef d''agrès FI',          'FI',   'MT',  140),
  ('EQUI_BIN1',    'Équipier binôme 1 (FI)',    'FI',   'MO2', 150),
  ('CHEF_BIN1',    'Chef de binôme 1 (FI)',     'FI',   NULL,  160),
  ('EQUI_BIN2',    'Équipier binôme 2 (FI)',    'FI',   'MO2', 170),
  ('CHEF_BIN2',    'Chef de binôme 2 (FI)',     'FI',   NULL,  180),
  ('EQU_MEA',      'Équipier MEA',              'MEA',  'MO2', 190),
  ('COND_MEA',     'Conducteur MEA',            'MEA',  'QM2', 200),
  ('CA_MEA',       'Chef d''agrès MEA',         'MEA',  'MT',  210),
  ('EQU_SR',       'Équipier CSR',              'CSR',  'MO2', 220),
  ('COND_SR',      'Conducteur CSR',            'CSR',  'QM2', 230),
  ('CA_SR',        'Chef d''agrès CSR',         'CSR',  'MT',  240)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- PLANNING / FEUILLE DE GARDE
-- Un créneau = un jour + un engin + un poste (fonction) => une personne.
-- Les postes proposés pour un engin découlent de sa catégorie (voir
-- POSTES_PAR_CATEGORIE côté front, public/index.html).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- COULEURS PERSONNALISABLES DES STATUTS D'ENGINS
-- Un administrateur peut redéfinir la couleur de chaque statut depuis
-- l'écran Synoptique des engins. Si aucune ligne n'existe pour un statut,
-- le front applique la couleur par défaut (voir DEFAULT_COLORS dans
-- netlify/functions/statut-couleurs.js).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS statut_couleurs (
  statut_code  VARCHAR(30) PRIMARY KEY,
  couleur      VARCHAR(7) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ENGINS ARMÉS PAR JOUR DE GARDE
-- Un engin n'apparaît dans la feuille de garde d'un jour donné que s'il a
-- explicitement été ajouté ici (parmi les engins présents au synoptique).
-- Le retirer supprime aussi ses affectations de poste pour ce jour-là
-- (voir netlify/functions/planning-engins.js).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planning_engins_jour (
  id          SERIAL PRIMARY KEY,
  date_garde  DATE NOT NULL,
  engin_id    INT NOT NULL REFERENCES engins(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by    VARCHAR(20),
  UNIQUE(date_garde, engin_id)
);
CREATE INDEX IF NOT EXISTS idx_planning_engins_jour_date ON planning_engins_jour(date_garde);

-- ------------------------------------------------------------
-- Compte admin de démarrage (À CHANGER IMMÉDIATEMENT APRÈS INSTALLATION)
-- matricule: 0001 / mot de passe temporaire: bmpm-admin
-- Le hash ci-dessous correspond réellement à bcrypt("bmpm-admin", 10 rounds)
-- (généré et vérifié avec bcryptjs). Change ce mot de passe dès la première
-- connexion : génère ton propre hash avec `node db/hash-password.js "monMotDePasse"`
-- puis remplace la valeur ci-dessous avant de déployer en production.
-- ------------------------------------------------------------
INSERT INTO personnel (matricule, password_hash, nom, grade_code, role) VALUES
  ('0001', '$2b$10$AstgFc1BHEXlm06oi7ksq.pJoNtwAV5OqRQCmUdp997WgcS3QHaBe', 'Administrateur', 'MJR', 'admin')
ON CONFLICT (matricule) DO NOTHING;
