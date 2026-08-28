const { sql, json, preflight, requireAuth } = require("./_lib");

// Lecture : tout le personnel connecté (utile pour affichage + planning)
// Écriture (changer le grade seuil d'une fonction) : admin uniquement
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const rows = await sql`
        SELECT f.id, f.code, f.libelle, f.categorie, f.seuil_grade_code,
               g.libelle AS seuil_grade_libelle, f.ordre
        FROM fonctions f
        LEFT JOIN grades g ON g.code = f.seuil_grade_code
        ORDER BY f.ordre ASC
      `;
      return json(200, { fonctions: rows });
    }

    // Modifier le grade seuil (ou la catégorie/libellé) d'une fonction existante
    if (event.httpMethod === "PUT") {
      requireAuth(event, ["admin"]);
      const body = JSON.parse(event.body || "{}");
      const id = Number(body.id);
      if (!id) return json(400, { error: "id manquant." });

      const seuil_grade_code = body.seuil_grade_code === "" ? null : (body.seuil_grade_code ?? undefined);

      const rows = await sql`
        UPDATE fonctions SET
          libelle          = COALESCE(${body.libelle ?? null}, libelle),
          categorie        = COALESCE(${body.categorie ?? null}, categorie),
          seuil_grade_code = ${seuil_grade_code === undefined ? sql`seuil_grade_code` : seuil_grade_code}
        WHERE id = ${id}
        RETURNING id, code, libelle, categorie, seuil_grade_code, ordre
      `;
      if (rows.length === 0) return json(404, { error: "Fonction introuvable." });
      return json(200, { fonction: rows[0] });
    }

    // Ajouter une fonction personnalisée (admin) : utile si un nouveau type d'engin apparaît
    if (event.httpMethod === "POST") {
      requireAuth(event, ["admin"]);
      const body = JSON.parse(event.body || "{}");
      const code = String(body.code || "").trim();
      const libelle = String(body.libelle || "").trim();
      const categorie = body.categorie ? String(body.categorie).trim().toUpperCase() : null;
      const seuil_grade_code = body.seuil_grade_code || null;
      const ordre = Number.isFinite(body.ordre) ? body.ordre : 999;

      if (!code || !libelle) return json(400, { error: "Code et libellé requis." });

      try {
        const rows = await sql`
          INSERT INTO fonctions (code, libelle, categorie, seuil_grade_code, ordre)
          VALUES (${code}, ${libelle}, ${categorie}, ${seuil_grade_code}, ${ordre})
          RETURNING id, code, libelle, categorie, seuil_grade_code, ordre
        `;
        return json(201, { fonction: rows[0] });
      } catch (e) {
        if (String(e.message).includes("duplicate key")) {
          return json(409, { error: "Ce code de fonction existe déjà." });
        }
        throw e;
      }
    }

    if (event.httpMethod === "DELETE") {
      requireAuth(event, ["admin"]);
      const id = Number(event.queryStringParameters && event.queryStringParameters.id);
      if (!id) return json(400, { error: "id manquant." });
      await sql`DELETE FROM fonctions WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
