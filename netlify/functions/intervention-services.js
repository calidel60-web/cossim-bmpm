const { sql, json, preflight, requireAuth } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Marquer un service comme prévenu sur une intervention
    if (event.httpMethod === "POST") {
      requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const intervention_id = Number(body.intervention_id);
      const service_id = Number(body.service_id);
      if (!intervention_id || !service_id) {
        return json(400, { error: "intervention_id et service_id requis." });
      }

      const rows = await sql`
        INSERT INTO intervention_services (intervention_id, service_id)
        VALUES (${intervention_id}, ${service_id})
        ON CONFLICT (intervention_id, service_id) DO NOTHING
        RETURNING intervention_id, service_id, heure_prevenu
      `;
      return json(201, { service: rows[0] ?? null });
    }

    // Annuler un "prévenu" (erreur de saisie)
    if (event.httpMethod === "DELETE") {
      requireAuth(event, EDIT_ROLES);
      const intervention_id = Number(event.queryStringParameters && event.queryStringParameters.intervention_id);
      const service_id = Number(event.queryStringParameters && event.queryStringParameters.service_id);
      if (!intervention_id || !service_id) {
        return json(400, { error: "intervention_id et service_id requis." });
      }

      await sql`
        DELETE FROM intervention_services
        WHERE intervention_id = ${intervention_id} AND service_id = ${service_id}
      `;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
