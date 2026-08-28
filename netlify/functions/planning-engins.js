const { sql, json, preflight, requireAuth } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

function isValidDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Liste des engins armés (ajoutés à la garde) pour un jour donné
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const date = (event.queryStringParameters && event.queryStringParameters.date) ||
        new Date().toISOString().slice(0, 10);
      if (!isValidDate(date)) return json(400, { error: "Date invalide (format attendu AAAA-MM-JJ)." });

      const rows = await sql`
        SELECT pej.engin_id
        FROM planning_engins_jour pej
        WHERE pej.date_garde = ${date}
      `;
      return json(200, { date, engin_ids: rows.map((r) => r.engin_id) });
    }

    // Armer un engin pour un jour donné (doit exister dans le synoptique)
    if (event.httpMethod === "POST") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const date_garde = body.date;
      const engin_id = Number(body.engin_id);

      if (!isValidDate(date_garde) || !engin_id) {
        return json(400, { error: "date et engin_id sont requis." });
      }

      const engin = await sql`SELECT id FROM engins WHERE id = ${engin_id}`;
      if (engin.length === 0) return json(404, { error: "Engin introuvable dans le synoptique." });

      await sql`
        INSERT INTO planning_engins_jour (date_garde, engin_id, added_by)
        VALUES (${date_garde}, ${engin_id}, ${user.matricule})
        ON CONFLICT (date_garde, engin_id) DO NOTHING
      `;
      return json(201, { ok: true });
    }

    // Retirer un engin de la garde d'un jour donné : nettoie aussi ses
    // affectations de poste pour ce même jour (feuille de garde).
    if (event.httpMethod === "DELETE") {
      requireAuth(event, EDIT_ROLES);
      const date_garde = event.queryStringParameters && event.queryStringParameters.date;
      const engin_id = Number(event.queryStringParameters && event.queryStringParameters.engin_id);

      if (!isValidDate(date_garde) || !engin_id) {
        return json(400, { error: "date et engin_id sont requis." });
      }

      await sql`DELETE FROM planning_gardes WHERE date_garde = ${date_garde} AND engin_id = ${engin_id}`;
      await sql`DELETE FROM planning_engins_jour WHERE date_garde = ${date_garde} AND engin_id = ${engin_id}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
