// Fusionne 6 anciennes fonctions Netlify en une seule (limite Vercel Hobby :
// 12 fonctions serverless max). Le routage se fait sur ?type=... — voir
// vercel.json qui redirige les anciennes URLs (/api/grades, /api/services,
// /api/fonctions, /api/motifs, /api/rues, /api/statut-couleurs) vers ici,
// donc le front-end n'a RIEN à changer.
const { sql, json, preflight, requireAuth, getBody, getQuery } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

const DEFAULT_COLORS = {
  alerte:            "#B980E8",
  en_route:          "#E6484F",
  sur_les_lieux:     "#F2A93C",
  message:           "#4FA6E8",
  message_urgent:    "#C62839",
  transport_ch:      "#E85FA0",
  arrive_ch:         "#8FA23A",
  disponible_radio:  "#35D398",
  indisponible:      "#7E97AF",
  rentre:            "#35D398",
};
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return preflight(res);

  const type = getQuery(req, "type");

  try {
    switch (type) {
      case "grades": return await handleGrades(req, res);
      case "services": return await handleServices(req, res);
      case "fonctions": return await handleFonctions(req, res);
      case "motifs": return await handleMotifs(req, res);
      case "rues": return await handleRues(req, res);
      case "statut-couleurs": return await handleStatutCouleurs(req, res);
      case "casernes": return await handleCasernes(req, res);
      default:
        return json(res, 400, { error: "Paramètre type manquant ou inconnu (grades, services, fonctions, motifs, rues, statut-couleurs, casernes)." });
    }
  } catch (e) {
    return json(res, e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};

/* ---------------------------------------------------------- GRADES */
async function handleGrades(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const rows = await sql`SELECT id, code, libelle, ordre FROM grades ORDER BY ordre ASC`;
    return json(res, 200, { grades: rows });
  }

  if (req.method === "POST") {
    requireAuth(req, ["admin"]);
    const body = getBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    const libelle = String(body.libelle || "").trim();
    const ordre = Number.isFinite(body.ordre) ? body.ordre : 999;
    if (!code || !libelle) return json(res, 400, { error: "Code et libellé requis." });

    try {
      const rows = await sql`
        INSERT INTO grades (code, libelle, ordre) VALUES (${code}, ${libelle}, ${ordre})
        RETURNING id, code, libelle, ordre
      `;
      return json(res, 201, { grade: rows[0] });
    } catch (e) {
      if (String(e.message).includes("duplicate key")) return json(res, 409, { error: "Ce code de grade existe déjà." });
      throw e;
    }
  }

  if (req.method === "DELETE") {
    requireAuth(req, ["admin"]);
    const code = getQuery(req, "code");
    if (!code) return json(res, 400, { error: "code manquant." });

    const inUse = await sql`SELECT 1 FROM personnel WHERE grade_code = ${code} LIMIT 1`;
    if (inUse.length > 0) return json(res, 409, { error: "Ce grade est encore attribué à du personnel." });

    await sql`DELETE FROM grades WHERE code = ${code}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* --------------------------------------------------------- SERVICES */
async function handleServices(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const rows = await sql`SELECT id, nom, ordre FROM services_reference ORDER BY ordre ASC`;
    return json(res, 200, { services: rows });
  }
  return json(res, 405, { error: "Méthode non autorisée." });
}

/* -------------------------------------------------------- FONCTIONS */
async function handleFonctions(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const rows = await sql`
      SELECT f.id, f.code, f.libelle, f.categorie, f.seuil_grade_code,
             g.libelle AS seuil_grade_libelle, f.ordre
      FROM fonctions f
      LEFT JOIN grades g ON g.code = f.seuil_grade_code
      ORDER BY f.ordre ASC
    `;
    return json(res, 200, { fonctions: rows });
  }

  if (req.method === "PUT") {
    requireAuth(req, ["admin"]);
    const body = getBody(req);
    const id = Number(body.id);
    if (!id) return json(res, 400, { error: "id manquant." });

    const seuil_grade_code = body.seuil_grade_code === "" ? null : (body.seuil_grade_code ?? undefined);

    const rows = await sql`
      UPDATE fonctions SET
        libelle          = COALESCE(${body.libelle ?? null}, libelle),
        categorie        = COALESCE(${body.categorie ?? null}, categorie),
        seuil_grade_code = ${seuil_grade_code === undefined ? sql`seuil_grade_code` : seuil_grade_code}
      WHERE id = ${id}
      RETURNING id, code, libelle, categorie, seuil_grade_code, ordre
    `;
    if (rows.length === 0) return json(res, 404, { error: "Fonction introuvable." });
    return json(res, 200, { fonction: rows[0] });
  }

  if (req.method === "POST") {
    requireAuth(req, ["admin"]);
    const body = getBody(req);
    const code = String(body.code || "").trim();
    const libelle = String(body.libelle || "").trim();
    const categorie = body.categorie ? String(body.categorie).trim().toUpperCase() : null;
    const seuil_grade_code = body.seuil_grade_code || null;
    const ordre = Number.isFinite(body.ordre) ? body.ordre : 999;
    if (!code || !libelle) return json(res, 400, { error: "Code et libellé requis." });

    try {
      const rows = await sql`
        INSERT INTO fonctions (code, libelle, categorie, seuil_grade_code, ordre)
        VALUES (${code}, ${libelle}, ${categorie}, ${seuil_grade_code}, ${ordre})
        RETURNING id, code, libelle, categorie, seuil_grade_code, ordre
      `;
      return json(res, 201, { fonction: rows[0] });
    } catch (e) {
      if (String(e.message).includes("duplicate key")) return json(res, 409, { error: "Ce code de fonction existe déjà." });
      throw e;
    }
  }

  if (req.method === "DELETE") {
    requireAuth(req, ["admin"]);
    const id = Number(getQuery(req, "id"));
    if (!id) return json(res, 400, { error: "id manquant." });
    await sql`DELETE FROM fonctions WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* ----------------------------------------------------------- MOTIFS */
async function handleMotifs(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const rows = await sql`SELECT id, libelle, ordre FROM motifs_reference ORDER BY ordre ASC, libelle ASC`;
    return json(res, 200, { motifs: rows });
  }

  if (req.method === "POST") {
    requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const libelle = String(body.libelle || "").trim().toUpperCase();
    if (!libelle) return json(res, 400, { error: "Libellé requis." });

    try {
      const rows = await sql`
        INSERT INTO motifs_reference (libelle, ordre) VALUES (${libelle}, 999)
        RETURNING id, libelle, ordre
      `;
      return json(res, 201, { motif: rows[0] });
    } catch (e) {
      if (String(e.message).includes("duplicate key")) return json(res, 409, { error: "Ce motif existe déjà." });
      throw e;
    }
  }

  if (req.method === "DELETE") {
    requireAuth(req, EDIT_ROLES);
    const id = Number(getQuery(req, "id"));
    if (!id) return json(res, 400, { error: "id manquant." });
    await sql`DELETE FROM motifs_reference WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* ------------------------------------------------------------- RUES */
async function handleRues(req, res) {
  requireAuth(req);
  if (req.method !== "GET") return json(res, 405, { error: "Méthode non autorisée." });

  const q = String(getQuery(req, "q") || "").trim();
  if (q.length < 2) return json(res, 200, { rues: [] });

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

  return json(res, 200, { rues: rows });
}

/* --------------------------------------------------- STATUT-COULEURS */
async function handleStatutCouleurs(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const rows = await sql`SELECT statut_code, couleur FROM statut_couleurs`;
    const colors = { ...DEFAULT_COLORS };
    rows.forEach((r) => { colors[r.statut_code] = r.couleur; });
    return json(res, 200, { colors, defaults: DEFAULT_COLORS });
  }

  if (req.method === "PUT" || req.method === "POST") {
    requireAuth(req, ["admin"]);
    const body = getBody(req);
    const colors = body.colors || {};

    const entries = Object.entries(colors).filter(([code, hex]) =>
      Object.prototype.hasOwnProperty.call(DEFAULT_COLORS, code) && HEX_RE.test(hex)
    );
    if (entries.length === 0) return json(res, 400, { error: "Aucune couleur valide fournie (format attendu : #RRGGBB)." });

    for (const [code, hex] of entries) {
      await sql`
        INSERT INTO statut_couleurs (statut_code, couleur)
        VALUES (${code}, ${hex})
        ON CONFLICT (statut_code) DO UPDATE SET couleur = ${hex}, updated_at = now()
      `;
    }

    const rows = await sql`SELECT statut_code, couleur FROM statut_couleurs`;
    const merged = { ...DEFAULT_COLORS };
    rows.forEach((r) => { merged[r.statut_code] = r.couleur; });
    return json(res, 200, { colors: merged });
  }

  if (req.method === "DELETE") {
    requireAuth(req, ["admin"]);
    const code = getQuery(req, "statut");
    if (code) await sql`DELETE FROM statut_couleurs WHERE statut_code = ${code}`;
    else await sql`DELETE FROM statut_couleurs`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* -------------------------------------------------------- CASERNES */
// Centres de secours : lecture pour tous, gestion pour opérateurs CO / admin.
async function handleCasernes(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const rows = await sql`
      SELECT c.id, c.code, c.nom, c.ordre,
             COUNT(e.id)::int AS nb_engins
      FROM casernes c
      LEFT JOIN engins e ON e.caserne_id = c.id
      GROUP BY c.id
      ORDER BY c.ordre ASC, c.nom ASC
    `;
    return json(res, 200, { casernes: rows });
  }

  if (req.method === "POST") {
    requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const nom = String(body.nom || "").trim();
    const code = String(body.code || "").trim().toUpperCase();
    if (!nom || !code) return json(res, 400, { error: "Code et nom du centre requis." });
    try {
      const rows = await sql`
        INSERT INTO casernes (code, nom, ordre)
        VALUES (${code}, ${nom}, COALESCE((SELECT MAX(ordre) FROM casernes), 0) + 10)
        RETURNING id, code, nom, ordre
      `;
      return json(res, 201, { caserne: rows[0] });
    } catch (e) {
      if (String(e.message).includes("duplicate key")) return json(res, 409, { error: "Ce code de centre existe déjà." });
      throw e;
    }
  }

  if (req.method === "PUT") {
    requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const id = Number(body.id);
    if (!id) return json(res, 400, { error: "id manquant." });
    const nom = body.nom ? String(body.nom).trim() : null;
    const code = body.code ? String(body.code).trim().toUpperCase() : null;
    try {
      const rows = await sql`
        UPDATE casernes SET
          nom  = COALESCE(${nom}, nom),
          code = COALESCE(${code}, code)
        WHERE id = ${id}
        RETURNING id, code, nom, ordre
      `;
      if (!rows.length) return json(res, 404, { error: "Centre introuvable." });
      // Garde la colonne texte historique synchronisée
      await sql`UPDATE engins SET caserne = ${rows[0].nom} WHERE caserne_id = ${id}`;
      return json(res, 200, { caserne: rows[0] });
    } catch (e) {
      if (String(e.message).includes("duplicate key")) return json(res, 409, { error: "Ce code de centre existe déjà." });
      throw e;
    }
  }

  if (req.method === "DELETE") {
    requireAuth(req, EDIT_ROLES);
    const id = Number(getQuery(req, "id"));
    if (!id) return json(res, 400, { error: "id manquant." });
    // Les engins du centre ne sont pas supprimés : ils repassent "non affectés".
    await sql`DELETE FROM casernes WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}
