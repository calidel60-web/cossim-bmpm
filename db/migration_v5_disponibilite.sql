-- COSSIM : simplification du synoptique des engins.
-- Le synoptique des engins ne permet plus de choisir un statut opérationnel
-- (En route / Sur les lieux / Message...) : ces statuts restent gérés
-- uniquement depuis l'engagement sur une intervention (intervention-engins).
-- Depuis le synoptique, on ne peut plus que basculer un engin
-- Disponible <-> Indisponible, avec un motif libre.
-- À exécuter une fois sur une base existante après déploiement de cette version.

BEGIN;

ALTER TABLE engins ADD COLUMN IF NOT EXISTS raison_indisponibilite TEXT;

COMMIT;
