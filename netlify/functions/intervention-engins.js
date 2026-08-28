const { sql, json, preflight, requireAuth, buildEngagementMessage, logMessage, VEHICLE_STATUS_LABELS, envoyerOrdreMission } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Engager un engin sur une intervention : passe aussi l'engin en statut "En route"
    if (event.httpMethod === "POST") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const intervention_id = Number(body.intervention_id);
      const engin_id = Number(body.engin_id);
      if (!intervention_id || !engin_id) {
        return json(400, { error: "intervention_id et engin_id requis." });
      }

      const rows = await sql`
        INSERT INTO intervention_engins (intervention_id, engin_id)
        VALUES (${intervention_id}, ${engin_id})
        ON CONFLICT (intervention_id, engin_id) DO NOTHING
        RETURNING id, intervention_id, engin_id, etat, heure_engagement
      `;

      await sql`
        UPDATE engins SET statut = 'en_route', updated_at = now(), updated_by = ${user.matricule}
        WHERE id = ${engin_id}
      `;

      if (rows[0]) {
        const enginRows = await sql`SELECT id, nom, categorie FROM engins WHERE id = ${engin_id}`;
        if (enginRows[0]) {
          const contenu = await buildEngagementMessage(sql, enginRows[0].nom, enginRows[0].categorie, engin_id);
          await logMessage(sql, intervention_id, `CTA ${user.nom}`, contenu);

          const interRows = await sql`SELECT * FROM interventions WHERE id = ${intervention_id}`;
          const engages = await sql`
            SELECT e.nom FROM intervention_engins ie JOIN engins e ON e.id = ie.engin_id
            WHERE ie.intervention_id = ${intervention_id}
          `;
          if (interRows[0]) {
            await envoyerOrdreMission(sql, interRows[0], enginRows[0], engages.map(x => x.nom));
          }
        }
      }

      return json(201, { moyen: rows[0] ?? null });
    }

    // Changer l'état d'un engin engagé : les statuts suivent le référentiel opérationnel.
    if (event.httpMethod === "PUT") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const id = Number(body.id);
      if (!id) return json(400, { error: "id manquant." });

      const etat = body.etat;
      const LEGACY_TO_NEW = { engage: "en_route", sur_place: "sur_les_lieux", disponible: "disponible_radio" };
      const normalizedEtat = LEGACY_TO_NEW[etat] || etat;
      const VALID_ETATS = [
        "en_route", "sur_les_lieux", "message", "message_urgent",
        "transport_ch", "arrive_ch", "disponible_radio", "indisponible", "rentre"
      ];
      if (!VALID_ETATS.includes(normalizedEtat)) {
        return json(400, { error: "État invalide." });
      }

      const estDisponible = ["disponible_radio", "rentre"].includes(normalizedEtat);

      const rows = estDisponible
        ? await sql`
            UPDATE intervention_engins SET
              etat = ${normalizedEtat},
              heure_disponible = now()
            WHERE id = ${id}
            RETURNING id, intervention_id, engin_id, etat, heure_engagement, heure_disponible
          `
        : await sql`
            UPDATE intervention_engins SET
              etat = ${normalizedEtat}
            WHERE id = ${id}
            RETURNING id, intervention_id, engin_id, etat, heure_engagement, heure_disponible
          `;
      if (rows.length === 0) return json(404, { error: "Engagement introuvable." });

      // Synchronise le statut global du véhicule avec son état opérationnel.
      await sql`
        UPDATE engins SET statut = ${normalizedEtat}, updated_at = now(), updated_by = ${user.matricule}
        WHERE id = ${rows[0].engin_id}
      `;

      const enginRows = await sql`SELECT nom FROM engins WHERE id = ${rows[0].engin_id}`;
      if (enginRows[0]) {
        const label = VEHICLE_STATUS_LABELS[normalizedEtat] || normalizedEtat;
        await logMessage(sql, rows[0].intervention_id, "Terminal ANTARES BER", `${enginRows[0].nom} - ${label}`);
      }

      return json(200, { moyen: rows[0] });
    }

    // Retirer un engin de l'engagement (erreur de saisie)
    if (event.httpMethod === "DELETE") {
      const user = requireAuth(event, EDIT_ROLES);
      const id = Number(event.queryStringParameters && event.queryStringParameters.id);
      if (!id) return json(400, { error: "id manquant." });

      const rows = await sql`DELETE FROM intervention_engins WHERE id = ${id} RETURNING engin_id`;
      if (rows[0]) {
        await sql`
          UPDATE engins SET statut = 'disponible_radio', updated_at = now(), updated_by = ${user.matricule}
          WHERE id = ${rows[0].engin_id}
        `;
      }
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
