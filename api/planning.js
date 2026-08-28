// Fusionne planning + planning-engins (limite Vercel Hobby). Routage sur
// ?resource=gardes (défaut, compatible avec les anciens appels à /api/planning
// sans paramètre) ou ?resource=engins-jour (ex /api/planning-engins, redirigé
// par vercel.json).
const { sql, json, preflight, requireAuth, getBody, getQuery } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

function isValidDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return preflight(res);

  const resource = getQuery(req, "resource") || "gardes";

  try {
    if (resource === "engins-jour") return await handleEnginsJour(req, res);
    return await handleGardes(req, res);
  } catch (e) {
    return json(res, e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};

/* ------------------------------------------------- FEUILLE DE GARDE */
async function handleGardes(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const date = getQuery(req, "date") || new Date().toISOString().slice(0, 10);
    if (!isValidDate(date)) return json(res, 400, { error: "Date invalide (format attendu AAAA-MM-JJ)." });

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
    return json(res, 200, { date, affectations: rows });
  }

  if (req.method === "POST" || req.method === "PUT") {
    const user = requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const date_garde = body.date;
    const engin_id = Number(body.engin_id);
    const poste_code = String(body.poste_code || "").trim();
    const personnel_id = body.personnel_id ? Number(body.personnel_id) : null;

    if (!isValidDate(date_garde) || !engin_id || !poste_code) {
      return json(res, 400, { error: "date, engin_id et poste_code sont requis." });
    }

    const rows = await sql`
      INSERT INTO planning_gardes (date_garde, engin_id, poste_code, personnel_id, updated_by)
      VALUES (${date_garde}, ${engin_id}, ${poste_code}, ${personnel_id}, ${user.matricule})
      ON CONFLICT (date_garde, engin_id, poste_code)
      DO UPDATE SET personnel_id = ${personnel_id}, updated_at = now(), updated_by = ${user.matricule}
      RETURNING id, date_garde, engin_id, poste_code, personnel_id
    `;
    return json(res, 200, { affectation: rows[0] });
  }

  if (req.method === "DELETE") {
    requireAuth(req, EDIT_ROLES);
    const id = Number(getQuery(req, "id"));
    if (!id) return json(res, 400, { error: "id manquant." });
    await sql`DELETE FROM planning_gardes WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* -------------------------------------------- ENGINS ARMÉS DU JOUR */
async function handleEnginsJour(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const date = getQuery(req, "date") || new Date().toISOString().slice(0, 10);
    if (!isValidDate(date)) return json(res, 400, { error: "Date invalide (format attendu AAAA-MM-JJ)." });

    const rows = await sql`SELECT engin_id FROM planning_engins_jour WHERE date_garde = ${date}`;
    return json(res, 200, { date, engin_ids: rows.map((r) => r.engin_id) });
  }

  if (req.method === "POST") {
    const user = requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const date_garde = body.date;
    const engin_id = Number(body.engin_id);
    if (!isValidDate(date_garde) || !engin_id) return json(res, 400, { error: "date et engin_id sont requis." });

    const engin = await sql`SELECT id FROM engins WHERE id = ${engin_id}`;
    if (engin.length === 0) return json(res, 404, { error: "Engin introuvable dans le synoptique." });

    await sql`
      INSERT INTO planning_engins_jour (date_garde, engin_id, added_by)
      VALUES (${date_garde}, ${engin_id}, ${user.matricule})
      ON CONFLICT (date_garde, engin_id) DO NOTHING
    `;
    return json(res, 201, { ok: true });
  }

  if (req.method === "DELETE") {
    requireAuth(req, EDIT_ROLES);
    const date_garde = getQuery(req, "date");
    const engin_id = Number(getQuery(req, "engin_id"));
    if (!isValidDate(date_garde) || !engin_id) return json(res, 400, { error: "date et engin_id sont requis." });

    await sql`DELETE FROM planning_gardes WHERE date_garde = ${date_garde} AND engin_id = ${engin_id}`;
    await sql`DELETE FROM planning_engins_jour WHERE date_garde = ${date_garde} AND engin_id = ${engin_id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}
