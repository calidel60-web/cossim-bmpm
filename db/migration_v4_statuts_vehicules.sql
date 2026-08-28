-- COSSIM : extension des statuts opérationnels des véhicules.
-- À exécuter une fois sur une base existante après déploiement de cette version.

BEGIN;

-- 1) Étendre le référentiel de statuts du synoptique des engins.
ALTER TABLE engins DROP CONSTRAINT IF EXISTS engins_statut_check;
UPDATE engins SET statut = 'disponible_radio' WHERE statut = 'disponible';
UPDATE engins SET statut = 'en_route' WHERE statut = 'intervention';
ALTER TABLE engins
  ALTER COLUMN statut SET DEFAULT 'disponible_radio',
  ALTER COLUMN statut TYPE VARCHAR(30);
ALTER TABLE engins
  ADD CONSTRAINT engins_statut_check CHECK (statut IN (
    'en_route','sur_les_lieux','message','message_urgent',
    'transport_ch','arrive_ch','disponible_radio','indisponible','rentre'
  ));

-- 2) Étendre les états des engins engagés sur intervention.
ALTER TABLE intervention_engins DROP CONSTRAINT IF EXISTS intervention_engins_etat_check;
UPDATE intervention_engins SET etat = 'en_route' WHERE etat = 'engage';
UPDATE intervention_engins SET etat = 'sur_les_lieux' WHERE etat = 'sur_place';
UPDATE intervention_engins SET etat = 'disponible_radio' WHERE etat = 'disponible';
ALTER TABLE intervention_engins
  ALTER COLUMN etat SET DEFAULT 'en_route',
  ALTER COLUMN etat TYPE VARCHAR(30);
ALTER TABLE intervention_engins
  ADD CONSTRAINT intervention_engins_etat_check CHECK (etat IN (
    'en_route','sur_les_lieux','message','message_urgent',
    'transport_ch','arrive_ch','disponible_radio','indisponible','rentre'
  ));

COMMIT;
