-- COSSIM : ajout du statut "alerté".
-- Quand le CTA diffuse un engin sur une intervention, l'engin passe
-- désormais en "alerté" (et non plus directement "en route") : c'est
-- ensuite au chef d'agrès de faire passer son engin en "En route" lui-même
-- (depuis le tableau des moyens engagés sur l'intervention).
-- À exécuter une fois sur une base existante après déploiement de cette version.

BEGIN;

ALTER TABLE engins DROP CONSTRAINT IF EXISTS engins_statut_check;
ALTER TABLE engins
  ADD CONSTRAINT engins_statut_check CHECK (statut IN (
    'alerte','en_route','sur_les_lieux','message','message_urgent',
    'transport_ch','arrive_ch','disponible_radio','indisponible','rentre'
  ));

ALTER TABLE intervention_engins DROP CONSTRAINT IF EXISTS intervention_engins_etat_check;
ALTER TABLE intervention_engins
  ALTER COLUMN etat SET DEFAULT 'alerte';
ALTER TABLE intervention_engins
  ADD CONSTRAINT intervention_engins_etat_check CHECK (etat IN (
    'alerte','en_route','sur_les_lieux','message','message_urgent',
    'transport_ch','arrive_ch','disponible_radio','indisponible','rentre'
  ));

COMMIT;
