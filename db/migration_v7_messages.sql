-- COSSIM : main courante — historique des messages d'une intervention
-- (engagements, changements d'état des engins, messages radio retransmis
-- manuellement par le CTA). À exécuter une fois sur une base existante.

CREATE TABLE IF NOT EXISTS intervention_messages (
  id                SERIAL PRIMARY KEY,
  intervention_id   INT NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  auteur            VARCHAR(100) NOT NULL,   -- "CTA <nom>" (opérateur) ou "Terminal ANTARES BER" (automatique)
  contenu           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_messages_inter
  ON intervention_messages(intervention_id, created_at);
