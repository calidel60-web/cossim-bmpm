-- COSSIM : engins armés par jour de garde (ajout/retrait depuis le planning).
-- À exécuter une fois sur une base existante après déploiement de cette version.

CREATE TABLE IF NOT EXISTS planning_engins_jour (
  id          SERIAL PRIMARY KEY,
  date_garde  DATE NOT NULL,
  engin_id    INT NOT NULL REFERENCES engins(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by    VARCHAR(20),
  UNIQUE(date_garde, engin_id)
);
CREATE INDEX IF NOT EXISTS idx_planning_engins_jour_date ON planning_engins_jour(date_garde);
