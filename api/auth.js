const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sql, json, preflight, getBody } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return preflight(res);
  if (req.method !== "POST") return json(res, 405, { error: "Méthode non autorisée." });

  const body = getBody(req);
  const matricule = String(body.matricule || "").trim();
  const password = String(body.password || "");

  if (!matricule || !password) {
    return json(res, 400, { error: "Matricule et mot de passe requis." });
  }

  try {
    const rows = await sql`
      SELECT p.matricule, p.password_hash, p.nom, p.grade_code, p.role, p.actif,
             g.libelle AS grade_libelle
      FROM personnel p
      JOIN grades g ON g.code = p.grade_code
      WHERE p.matricule = ${matricule}
      LIMIT 1
    `;

    if (rows.length === 0) return json(res, 401, { error: "Matricule inconnu." });

    const user = rows[0];
    if (!user.actif) return json(res, 403, { error: "Ce compte a été désactivé." });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return json(res, 401, { error: "Mot de passe incorrect." });

    const token = jwt.sign(
      { matricule: user.matricule, nom: user.nom, grade_code: user.grade_code, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return json(res, 200, {
      token,
      user: {
        matricule: user.matricule,
        nom: user.nom,
        grade_code: user.grade_code,
        grade_libelle: user.grade_libelle,
        role: user.role,
      },
    });
  } catch (e) {
    return json(res, e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
