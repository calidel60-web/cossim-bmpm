const { sql, json, preflight, requireAuth, logMessage } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture : liste, ou une intervention précise avec ses moyens/services engagés
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const id = event.queryStringParameters && event.queryStringParameters.id;

      if (id) {
        const inter = await sql`SELECT * FROM interventions WHERE id = ${Number(id)}`;
        if (inter.length === 0) return json(404, { error: "Intervention introuvable." });

        const moyens = await sql`
          SELECT ie.id, ie.engin_id, e.nom AS engin_nom, ie.etat,
                 ie.heure_engagement, ie.heure_disponible
          FROM intervention_engins ie
          JOIN engins e ON e.id = ie.engin_id
          WHERE ie.intervention_id = ${Number(id)}
          ORDER BY ie.heure_engagement ASC
        `;

        const services = await sql`
          SELECT s.id, s.nom, isv.heure_prevenu
          FROM intervention_services isv
          JOIN services_reference s ON s.id = isv.service_id
          WHERE isv.intervention_id = ${Number(id)}
          ORDER BY isv.heure_prevenu ASC
        `;

        return json(200, { intervention: inter[0], moyens, services });
      }

      const statut = event.queryStringParameters && event.queryStringParameters.statut;
      const rows = statut
        ? await sql`
            SELECT i.*,
              COUNT(DISTINCT ie.id) FILTER (WHERE ie.etat <> 'rentre') AS moyens_actifs,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('nom', e.nom, 'categorie', e.categorie, 'etat', ie.etat))
                  FILTER (WHERE ie.id IS NOT NULL), '[]'
              ) AS engins_engages,
              COALESCE(
                json_agg(DISTINCT sr.nom) FILTER (WHERE sr.id IS NOT NULL), '[]'
              ) AS services_prevenus
            FROM interventions i
            LEFT JOIN intervention_engins ie ON ie.intervention_id = i.id
            LEFT JOIN engins e ON e.id = ie.engin_id
            LEFT JOIN intervention_services isv ON isv.intervention_id = i.id
            LEFT JOIN services_reference sr ON sr.id = isv.service_id
            WHERE i.statut = ${statut}
            GROUP BY i.id
            ORDER BY i.created_at DESC
            LIMIT 100
          `
        : await sql`
            SELECT i.*,
              COUNT(DISTINCT ie.id) FILTER (WHERE ie.etat <> 'rentre') AS moyens_actifs,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object('nom', e.nom, 'categorie', e.categorie, 'etat', ie.etat))
                  FILTER (WHERE ie.id IS NOT NULL), '[]'
              ) AS engins_engages,
              COALESCE(
                json_agg(DISTINCT sr.nom) FILTER (WHERE sr.id IS NOT NULL), '[]'
              ) AS services_prevenus
            FROM interventions i
            LEFT JOIN intervention_engins ie ON ie.intervention_id = i.id
            LEFT JOIN engins e ON e.id = ie.engin_id
            LEFT JOIN intervention_services isv ON isv.intervention_id = i.id
            LEFT JOIN services_reference sr ON sr.id = isv.service_id
            GROUP BY i.id
            ORDER BY i.created_at DESC
            LIMIT 100
          `;

      return json(200, { interventions: rows });
    }

    // Création : opérateur CTA ou admin
    if (event.httpMethod === "POST") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");

      const rows = await sql`
        INSERT INTO interventions
          (motif, sinistre, observation, adresse, commune, arrondissement, type_voie,
           etare, consignes, appelant, latitude, longitude, created_by)
        VALUES
          (${body.motif ?? null}, ${body.sinistre ?? null}, ${body.observation ?? null}, ${body.adresse ?? null},
           ${body.commune ?? null}, ${body.arrondissement ?? null}, ${body.type_voie ?? null},
           ${body.etare ?? null}, ${body.consignes ?? null},
           ${body.appelant ?? null}, ${body.latitude ?? null}, ${body.longitude ?? null},
           ${user.matricule})
        RETURNING *
      `;
      return json(201, { intervention: rows[0] });
    }

    // Mise à jour des infos générales / clôture : opérateur CTA ou admin
    if (event.httpMethod === "PUT") {
      requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const id = Number(body.id);
      if (!id) return json(400, { error: "id manquant." });

      if (body.statut && !["en_cours", "cloturee"].includes(body.statut)) {
        return json(400, { error: "Statut invalide." });
      }

      const rows = await sql`
        UPDATE interventions SET
          motif          = COALESCE(${body.motif ?? null}, motif),
          sinistre       = COALESCE(${body.sinistre ?? null}, sinistre),
          observation    = COALESCE(${body.observation ?? null}, observation),
          adresse        = COALESCE(${body.adresse ?? null}, adresse),
          commune        = COALESCE(${body.commune ?? null}, commune),
          arrondissement = COALESCE(${body.arrondissement ?? null}, arrondissement),
          type_voie      = COALESCE(${body.type_voie ?? null}, type_voie),
          etare          = COALESCE(${body.etare ?? null}, etare),
          consignes      = COALESCE(${body.consignes ?? null}, consignes),
          appelant       = COALESCE(${body.appelant ?? null}, appelant),
          latitude       = COALESCE(${body.latitude ?? null}, latitude),
          longitude      = COALESCE(${body.longitude ?? null}, longitude),
          statut         = COALESCE(${body.statut ?? null}, statut),
          updated_at     = now()
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return json(404, { error: "Intervention introuvable." });

      // Clôture : tous les engins encore engagés sur cette intervention
      // repassent automatiquement en "Rentré" (rentré caserne).
      if (body.statut === "cloturee") {
        const engagesRestants = await sql`
          SELECT ie.id, ie.engin_id, e.nom
          FROM intervention_engins ie
          JOIN engins e ON e.id = ie.engin_id
          WHERE ie.intervention_id = ${id} AND ie.etat <> 'rentre'
        `;

        if (engagesRestants.length > 0) {
          await sql`
            UPDATE intervention_engins SET etat = 'rentre', heure_disponible = now()
            WHERE intervention_id = ${id} AND etat <> 'rentre'
          `;
          await sql`
            UPDATE engins SET statut = 'rentre', updated_at = now()
            WHERE id = ANY(${engagesRestants.map((e) => e.engin_id)})
          `;
          for (const e of engagesRestants) {
            await logMessage(sql, id, "Terminal ANTARES BER", `${e.nom} - Rentré`);
          }
        }
      }

      return json(200, { intervention: rows[0] });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
