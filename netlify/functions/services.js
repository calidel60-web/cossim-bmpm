const { sql, json, preflight, requireAuth } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const rows = await sql`
        SELECT id, nom, ordre FROM services_reference ORDER BY ordre ASC
      `;
      return json(200, { services: rows });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
