const { sql, json, preflight, requireAuth } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture : tout le personnel connecté (autocomplétion du champ Sinistre)
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const rows = await sql`SELECT id, libelle, ordre FROM motifs_reference ORDER BY ordre ASC, libelle ASC`;
      return json(200, { motifs: rows });
    }

    // Ajout d'un motif : opérateur CTA ou admin
    if (event.httpMethod === "POST") {
      requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const libelle = String(body.libelle || "").trim().toUpperCase();
      if (!libelle) return json(400, { error: "Libellé requis." });

      try {
        const rows = await sql`
          INSERT INTO motifs_reference (libelle, ordre) VALUES (${libelle}, 999)
          RETURNING id, libelle, ordre
        `;
        return json(201, { motif: rows[0] });
      } catch (e) {
        if (String(e.message).includes("duplicate key")) {
          return json(409, { error: "Ce motif existe déjà." });
        }
        throw e;
      }
    }

    // Suppression : opérateur CTA ou admin
    if (event.httpMethod === "DELETE") {
      requireAuth(event, EDIT_ROLES);
      const id = Number(event.queryStringParameters && event.queryStringParameters.id);
      if (!id) return json(400, { error: "id manquant." });
      await sql`DELETE FROM motifs_reference WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
