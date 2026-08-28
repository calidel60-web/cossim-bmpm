const { sql, json, preflight, requireAuth } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture de l'historique complet d'une intervention, ordre chronologique
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const intervention_id = Number(event.queryStringParameters && event.queryStringParameters.intervention_id);
      if (!intervention_id) return json(400, { error: "intervention_id requis." });

      const rows = await sql`
        SELECT id, auteur, contenu, created_at
        FROM intervention_messages
        WHERE intervention_id = ${intervention_id}
        ORDER BY created_at ASC, id ASC
      `;
      return json(200, { messages: rows });
    }

    // Retransmettre / saisir un message (radio engin, ou note CTA) : opérateur CTA ou admin
    if (event.httpMethod === "POST") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const intervention_id = Number(body.intervention_id);
      const contenu = String(body.contenu || "").trim();
      if (!intervention_id || !contenu) {
        return json(400, { error: "intervention_id et contenu sont requis." });
      }

      // auteur explicite (ex: "Terminal VSAV 01") sinon on signe "CTA <nom de l'opérateur>"
      const auteur = body.auteur ? String(body.auteur).trim() : `CTA ${user.nom}`;

      const rows = await sql`
        INSERT INTO intervention_messages (intervention_id, auteur, contenu)
        VALUES (${intervention_id}, ${auteur}, ${contenu})
        RETURNING id, auteur, contenu, created_at
      `;
      return json(201, { message: rows[0] });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
