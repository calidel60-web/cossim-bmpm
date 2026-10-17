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
        SELECT e.id, e.nom, e.categorie, e.caserne, e.caserne_id, c.nom AS caserne_nom, c.code AS caserne_code,
               e.statut, e.ordre, e.updated_at, e.updated_by
        FROM engins e
        LEFT JOIN casernes c ON c.id = e.caserne_id
        ORDER BY c.ordre ASC NULLS LAST, e.ordre ASC, e.nom ASC
      `;
      return json(res, 200, { engins: rows });
    }

    if (req.method === "POST") {
      const user = requireAuth(req, EDIT_ROLES);
      const body = getBody(req);
      const nom = String(body.nom || "").trim();
      const categorie = body.categorie ? String(body.categorie).trim() : null;
      const caserne_id = Number(body.caserne_id) || null;
      const ordre = Number.isFinite(body.ordre) ? body.ordre : 0;

      if (!nom) return json(res, 400, { error: "Le nom de l'engin est requis." });

      const rows = await sql`
        INSERT INTO engins (nom, categorie, caserne, caserne_id, ordre, updated_by)
        VALUES (${nom}, ${categorie},
                COALESCE((SELECT nom FROM casernes WHERE id = ${caserne_id}), 'NON AFFECTÉ'),
                ${caserne_id}, ${ordre}, ${user.matricule})
        RETURNING id, nom, categorie, caserne, caserne_id, statut, ordre, updated_at, updated_by
      `;
      return json(res, 201, { engin: rows[0] });
    }

    if (req.method === "PUT") {
      const user = requireAuth(req, EDIT_ROLES);
      const body = getBody(req);
      const id = Number(body.id);
      if (!id) return json(res, 400, { error: "id manquant." });

      // caserne_id présent dans le corps (même null) = (ré)affectation de l'engin
      const hasCaserne = Object.prototype.hasOwnProperty.call(body, "caserne_id");
      const newCaserneId = hasCaserne ? (Number(body.caserne_id) || null) : null;
      const statut = body.statut ?? null;
      if (statut && !VALID_STATUTS.includes(statut)) {
        return json(res, 400, { error: "Statut invalide." });
      }

      const rows = await sql`
        UPDATE engins SET
          nom        = COALESCE(${body.nom ?? null}, nom),
          categorie  = COALESCE(${body.categorie ?? null}, categorie),
          caserne_id = CASE WHEN ${hasCaserne} THEN ${newCaserneId} ELSE caserne_id END,
          caserne    = CASE WHEN ${hasCaserne}
                         THEN COALESCE((SELECT nom FROM casernes WHERE id = ${newCaserneId}), 'NON AFFECTÉ')
                         ELSE caserne END,
          statut     = COALESCE(${statut}, statut),
          ordre      = COALESCE(${body.ordre ?? null}, ordre),
          updated_at = now(),
          updated_by = ${user.matricule}
        WHERE id = ${id}
        RETURNING id, nom, categorie, caserne, caserne_id, statut, ordre, updated_at, updated_by
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
