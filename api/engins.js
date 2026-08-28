const { sql, json, preflight, requireAuth, getBody, getQuery } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];
const VALID_STATUTS = [
  "en_route", "sur_les_lieux", "message", "message_urgent",
  "transport_ch", "arrive_ch", "disponible_radio", "indisponible", "rentre"
];

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return preflight(res);

  try {
    if (req.method === "GET") {
      requireAuth(req);
      const rows = await sql`
        SELECT id, nom, categorie, caserne, statut, ordre, updated_at, updated_by
        FROM engins
        ORDER BY ordre ASC, nom ASC
      `;
      return json(res, 200, { engins: rows });
    }

    if (req.method === "POST") {
      const user = requireAuth(req, EDIT_ROLES);
      const body = getBody(req);
      const nom = String(body.nom || "").trim();
      const categorie = body.categorie ? String(body.categorie).trim() : null;
      const caserne = body.caserne ? String(body.caserne).trim() : "CIS LOUVAIN";
      const ordre = Number.isFinite(body.ordre) ? body.ordre : 0;

      if (!nom) return json(res, 400, { error: "Le nom de l'engin est requis." });

      const rows = await sql`
        INSERT INTO engins (nom, categorie, caserne, ordre, updated_by)
        VALUES (${nom}, ${categorie}, ${caserne}, ${ordre}, ${user.matricule})
        RETURNING id, nom, categorie, caserne, statut, ordre, updated_at, updated_by
      `;
      return json(res, 201, { engin: rows[0] });
    }

    if (req.method === "PUT") {
      const user = requireAuth(req, EDIT_ROLES);
      const body = getBody(req);
      const id = Number(body.id);
      if (!id) return json(res, 400, { error: "id manquant." });

      const statut = body.statut ?? null;
      if (statut && !VALID_STATUTS.includes(statut)) {
        return json(res, 400, { error: "Statut invalide." });
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
      if (rows.length === 0) return json(res, 404, { error: "Engin introuvable." });
      return json(res, 200, { engin: rows[0] });
    }

    if (req.method === "DELETE") {
      requireAuth(req, EDIT_ROLES);
      const id = Number(getQuery(req, "id"));
      if (!id) return json(res, 400, { error: "id manquant." });

      await sql`DELETE FROM engins WHERE id = ${id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(res, e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
