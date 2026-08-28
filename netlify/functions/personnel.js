const bcrypt = require("bcryptjs");
const { sql, json, preflight, requireAuth } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture de la liste :
    // - admin : accès complet (gestion RH)
    // - opérateur CTA : lecture seule, nécessaire pour affecter le personnel
    //   dans le planning / feuille de garde (fonctions calculées incluses)
    if (event.httpMethod === "GET") {
      requireAuth(event, ["admin", "operateur_cta"]);
      const rows = await sql`
        SELECT p.id, p.matricule, p.nom, p.grade_code, g.libelle AS grade_libelle,
               g.ordre AS grade_ordre, p.role, p.actif, p.created_at, p.updated_at
        FROM personnel p
        JOIN grades g ON g.code = p.grade_code
        ORDER BY p.nom ASC
      `;

      // Équivalence grade -> fonctions : une personne acquiert une fonction dès que
      // son grade atteint (ou dépasse) le grade seuil défini pour cette fonction.
      const fonctions = await sql`
        SELECT f.code, f.categorie, g.ordre AS seuil_ordre
        FROM fonctions f
        JOIN grades g ON g.code = f.seuil_grade_code
      `;

      const personnel = rows.map((p) => ({
        ...p,
        fonctions: fonctions
          .filter((f) => f.seuil_ordre <= p.grade_ordre)
          .map((f) => f.code),
      }));

      return json(200, { personnel });
    }

    if (event.httpMethod === "POST") {
      requireAuth(event, ["admin"]);
      const body = JSON.parse(event.body || "{}");
      const matricule = String(body.matricule || "").trim();
      const nom = String(body.nom || "").trim();
      const grade_code = String(body.grade_code || "").trim();
      const role = ["agent", "operateur_cta", "admin"].includes(body.role) ? body.role : "agent";
      const password = String(body.password || "").trim();

      if (!matricule || !nom || !grade_code || !password) {
        return json(400, { error: "Matricule, nom, grade et mot de passe sont requis." });
      }

      const password_hash = bcrypt.hashSync(password, 10);

      try {
        const rows = await sql`
          INSERT INTO personnel (matricule, password_hash, nom, grade_code, role)
          VALUES (${matricule}, ${password_hash}, ${nom}, ${grade_code}, ${role})
          RETURNING id, matricule, nom, grade_code, role, actif, created_at, updated_at
        `;
        return json(201, { personnel: rows[0] });
      } catch (e) {
        if (String(e.message).includes("duplicate key")) {
          return json(409, { error: "Ce matricule existe déjà." });
        }
        throw e;
      }
    }

    if (event.httpMethod === "PUT") {
      requireAuth(event, ["admin"]);
      const body = JSON.parse(event.body || "{}");
      const id = Number(body.id);
      if (!id) return json(400, { error: "id manquant." });

      const password_hash = body.password ? bcrypt.hashSync(String(body.password), 10) : null;

      const rows = await sql`
        UPDATE personnel SET
          nom         = COALESCE(${body.nom ?? null}, nom),
          grade_code  = COALESCE(${body.grade_code ?? null}, grade_code),
          role        = COALESCE(${body.role ?? null}, role),
          actif       = COALESCE(${body.actif ?? null}, actif),
          password_hash = COALESCE(${password_hash}, password_hash),
          updated_at  = now()
        WHERE id = ${id}
        RETURNING id, matricule, nom, grade_code, role, actif, created_at, updated_at
      `;
      if (rows.length === 0) return json(404, { error: "Personne introuvable." });
      return json(200, { personnel: rows[0] });
    }

    if (event.httpMethod === "DELETE") {
      requireAuth(event, ["admin"]);
      const id = Number(event.queryStringParameters && event.queryStringParameters.id);
      if (!id) return json(400, { error: "id manquant." });

      await sql`DELETE FROM personnel WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
