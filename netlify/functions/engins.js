const { sql, json, preflight, requireAuth } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture : accessible à tout le personnel connecté
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const rows = await sql`
        SELECT id, nom, categorie, caserne, statut, ordre, updated_at, updated_by
        FROM engins
        ORDER BY ordre ASC, nom ASC
      `;
      return json(200, { engins: rows });
    }

    // Création : opérateur CTA ou admin
    if (event.httpMethod === "POST") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const nom = String(body.nom || "").trim();
      const categorie = body.categorie ? String(body.categorie).trim() : null;
      const caserne = body.caserne ? String(body.caserne).trim() : "CIS LOUVAIN";
      const ordre = Number.isFinite(body.ordre) ? body.ordre : 0;

      if (!nom) return json(400, { error: "Le nom de l'engin est requis." });

      const rows = await sql`
        INSERT INTO engins (nom, categorie, caserne, ordre, updated_by)
        VALUES (${nom}, ${categorie}, ${caserne}, ${ordre}, ${user.matricule})
        RETURNING id, nom, categorie, caserne, statut, ordre, updated_at, updated_by
      `;
      return json(201, { engin: rows[0] });
    }

    // Mise à jour (statut, catégorie, ordre...) : opérateur CTA ou admin
    if (event.httpMethod === "PUT") {
      const user = requireAuth(event, EDIT_ROLES);
      const body = JSON.parse(event.body || "{}");
      const id = Number(body.id);
      if (!id) return json(400, { error: "id manquant." });

      const statut = body.statut ?? null;
      const VALID_STATUTS = [
        "en_route", "sur_les_lieux", "message", "message_urgent",
        "transport_ch", "arrive_ch", "disponible_radio", "indisponible", "rentre"
      ];
      if (statut && !VALID_STATUTS.includes(statut)) {
        return json(400, { error: "Statut invalide." });
      }

      const rows = await sql`
        UPDATE engins SET
          nom        = COALESCE(${body.nom ?? null}, nom),
          categorie  = COALESCE(${body.categorie ?? null}, categorie),
          caserne    = COALESCE(${body.caserne ?? null}, caserne),
          statut     = COALESCE(${statut}, statut),
          ordre      = COALESCE(${body.ordre ?? null}, ordre),
          updated_at = now(),
          updated_by = ${user.matricule}
        WHERE id = ${id}
        RETURNING id, nom, categorie, caserne, statut, ordre, updated_at, updated_by
      `;
      if (rows.length === 0) return json(404, { error: "Engin introuvable." });
      return json(200, { engin: rows[0] });
    }

    // Suppression : opérateur CTA ou admin
    if (event.httpMethod === "DELETE") {
      requireAuth(event, EDIT_ROLES);
      const id = Number(event.queryStringParameters && event.queryStringParameters.id);
      if (!id) return json(400, { error: "id manquant." });

      await sql`DELETE FROM engins WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
