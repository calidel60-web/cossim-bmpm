-- COSSIM : couleurs personnalisables des statuts d'engins.
-- À exécuter une fois sur une base existante après déploiement de cette version.

CREATE TABLE IF NOT EXISTS statut_couleurs (
  statut_code  VARCHAR(30) PRIMARY KEY,
  couleur      VARCHAR(7) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
