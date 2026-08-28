const { sql, json, preflight, requireAuth } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture : tout le personnel connecté (nécessaire pour les formulaires)
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const rows = await sql`SELECT id, code, libelle, ordre FROM grades ORDER BY ordre ASC`;
      return json(200, { grades: rows });
    }

    // Ajout d'un grade personnalisé : admin uniquement
    if (event.httpMethod === "POST") {
      requireAuth(event, ["admin"]);
      const body = JSON.parse(event.body || "{}");
      const code = String(body.code || "").trim().toUpperCase();
      const libelle = String(body.libelle || "").trim();
      const ordre = Number.isFinite(body.ordre) ? body.ordre : 999;

      if (!code || !libelle) return json(400, { error: "Code et libellé requis." });

      try {
        const rows = await sql`
          INSERT INTO grades (code, libelle, ordre)
          VALUES (${code}, ${libelle}, ${ordre})
          RETURNING id, code, libelle, ordre
        `;
        return json(201, { grade: rows[0] });
      } catch (e) {
        if (String(e.message).includes("duplicate key")) {
          return json(409, { error: "Ce code de grade existe déjà." });
        }
        throw e;
      }
    }

    // Suppression : admin uniquement (refusée si le grade est encore utilisé)
    if (event.httpMethod === "DELETE") {
      requireAuth(event, ["admin"]);
      const code = event.queryStringParameters && event.queryStringParameters.code;
      if (!code) return json(400, { error: "code manquant." });

      const inUse = await sql`SELECT 1 FROM personnel WHERE grade_code = ${code} LIMIT 1`;
      if (inUse.length > 0) {
        return json(409, { error: "Ce grade est encore attribué à du personnel." });
      }

      await sql`DELETE FROM grades WHERE code = ${code}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
