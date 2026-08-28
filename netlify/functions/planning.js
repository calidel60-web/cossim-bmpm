const { sql, json, preflight, requireAuth } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

function isValidDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture des affectations pour un jour donné (défaut : aujourd'hui)
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const date = (event.queryStringParameters && event.queryStringParameters.date) ||
        new Date().toISOString().slice(0, 10);
      if (!isValidDate(date)) return json(400, { error: "Date invalide (format attendu AAAA-MM-JJ)." });

      const rows = await sql`
        SELECT pg.id, pg.date_garde, pg.engin_id, e.nom AS engin_nom, e.categorie,
               pg.poste_code, pg.personnel_id, per.nom AS personnel_nom,
               per.matricule AS personnel_matricule, per.grade_code AS personnel_grade_code
        FROM planning_gardes pg
        JOIN engins e ON e.id = pg.engin_id
        LEFT JOIN personnel per ON per.id = pg.personnel_id
        WHERE pg.date_garde = ${date}
        ORDER BY e.ordre ASC, pg.poste_code ASC
      `;
      return json(200, { date, affectations: rows });
    }

    // Affecter (ou changer) une personne à un poste d'un engin pour un jour donné
    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const date_garde = body.date;
      const engin_id = Number(body.engin_id);
      const poste_code = String(body.poste_code || "").trim();
      const personnel_id = body.personnel_id ? Number(body.personnel_id) : null;

      if (!isValidDate(date_garde) || !engin_id || !poste_code) {
        return json(400, { error: "date, engin_id et poste_code sont requis." });
      }

      const rows = await sql`
        INSERT INTO planning_gardes (date_garde, engin_id, poste_code, personnel_id, updated_by)
        VALUES (${date_garde}, ${engin_id}, ${poste_code}, ${personnel_id}, ${user.matricule})
        ON CONFLICT (date_garde, engin_id, poste_code)
        DO UPDATE SET personnel_id = ${personnel_id}, updated_at = now(), updated_by = ${user.matricule}
        RETURNING id, date_garde, engin_id, poste_code, personnel_id
      `;
      return json(200, { affectation: rows[0] });
    }

    // Vider un créneau
    if (event.httpMethod === "DELETE") {
      requireAuth(event, EDIT_ROLES);
      const id = Number(event.queryStringParameters && event.queryStringParameters.id);
      if (!id) return json(400, { error: "id manquant." });
      await sql`DELETE FROM planning_gardes WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
