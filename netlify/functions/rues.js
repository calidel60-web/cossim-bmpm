const { sql, json, preflight, requireAuth } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    requireAuth(event);
    if (event.httpMethod !== "GET") return json(405, { error: "Méthode non autorisée." });

    const q = String((event.queryStringParameters && event.queryStringParameters.q) || "").trim();
    if (q.length < 2) return json(200, { rues: [] });

    const rows = await sql`
      SELECT id, nom, type_voie, commune, arrondissement, code_postal,
             TRIM(CONCAT_WS(' ', NULLIF(type_voie, ''), nom)) AS nom_complet
      FROM rues
      WHERE actif = TRUE
        AND (
          LOWER(nom) LIKE LOWER(${q} || '%')
          OR LOWER(TRIM(CONCAT_WS(' ', NULLIF(type_voie, ''), nom))) LIKE LOWER(${q} || '%')
          OR LOWER(nom) LIKE LOWER('%' || ${q} || '%')
        )
      ORDER BY
        CASE
          WHEN LOWER(nom) = LOWER(${q}) THEN 0
          WHEN LOWER(nom) LIKE LOWER(${q} || '%') THEN 1
          ELSE 2
        END,
        nom ASC
      LIMIT 20
    `;

    return json(200, { rues: rows });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
