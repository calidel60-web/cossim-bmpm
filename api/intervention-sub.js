// Fusionne intervention-engins, intervention-services et
// intervention-messages en une seule fonction (limite Vercel Hobby).
// Routage sur ?resource=engins|services|messages — voir vercel.json.
const { sql, json, preflight, requireAuth, getBody, getQuery,
        buildEngagementMessage, logMessage, VEHICLE_STATUS_LABELS, envoyerOrdreMission, envoyerOrdreDiscord } = require("./_lib");

const EDIT_ROLES = ["operateur_cta", "admin"];

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return preflight(res);

  const resource = getQuery(req, "resource");

  try {
    switch (resource) {
      case "engins": return await handleEngins(req, res);
      case "services": return await handleServices(req, res);
      case "messages": return await handleMessages(req, res);
      case "ordre-mission": return await handleOrdreMission(req, res);
      default:
        return json(res, 400, { error: "Paramètre resource manquant ou inconnu (engins, services, messages, ordre-mission)." });
    }
  } catch (e) {
    return json(res, e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};

/* --------------------------------------------- ENGINS ENGAGÉS ---- */
async function handleEngins(req, res) {
  if (req.method === "POST") {
    const user = requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const intervention_id = Number(body.intervention_id);
    const engin_id = Number(body.engin_id);
    if (!intervention_id || !engin_id) return json(res, 400, { error: "intervention_id et engin_id requis." });

    const rows = await sql`
      INSERT INTO intervention_engins (intervention_id, engin_id)
      VALUES (${intervention_id}, ${engin_id})
      ON CONFLICT (intervention_id, engin_id) DO NOTHING
      RETURNING id, intervention_id, engin_id, etat, heure_engagement
    `;

    await sql`
      UPDATE engins SET statut = 'en_route', updated_at = now(), updated_by = ${user.matricule}
      WHERE id = ${engin_id}
    `;

    if (rows[0]) {
      const enginRows = await sql`SELECT id, nom, categorie FROM engins WHERE id = ${engin_id}`;
      if (enginRows[0]) {
        const contenu = await buildEngagementMessage(sql, enginRows[0].nom, enginRows[0].categorie, engin_id);
        await logMessage(sql, intervention_id, `CO ${user.nom}`, contenu);

        const interRows = await sql`SELECT * FROM interventions WHERE id = ${intervention_id}`;
        const engages = await sql`
          SELECT e.nom FROM intervention_engins ie JOIN engins e ON e.id = ie.engin_id
          WHERE ie.intervention_id = ${intervention_id}
        `;
        if (interRows[0]) {
          await envoyerOrdreMission(sql, interRows[0], enginRows[0], engages.map(x => x.nom));
        }
      }
    }

    return json(res, 201, { moyen: rows[0] ?? null });
  }

  if (req.method === "PUT") {
    const user = requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const id = Number(body.id);
    if (!id) return json(res, 400, { error: "id manquant." });

    const etat = body.etat;
    const LEGACY_TO_NEW = { engage: "en_route", sur_place: "sur_les_lieux", disponible: "disponible_radio" };
    const normalizedEtat = LEGACY_TO_NEW[etat] || etat;
    const VALID_ETATS = [
      "en_route", "sur_les_lieux", "message", "message_urgent",
      "transport_ch", "arrive_ch", "disponible_radio", "indisponible", "rentre"
    ];
    if (!VALID_ETATS.includes(normalizedEtat)) return json(res, 400, { error: "État invalide." });

    const estDisponible = ["disponible_radio", "rentre"].includes(normalizedEtat);

    const rows = estDisponible
      ? await sql`
          UPDATE intervention_engins SET etat = ${normalizedEtat}, heure_disponible = now()
          WHERE id = ${id}
          RETURNING id, intervention_id, engin_id, etat, heure_engagement, heure_disponible
        `
      : await sql`
          UPDATE intervention_engins SET etat = ${normalizedEtat}
          WHERE id = ${id}
          RETURNING id, intervention_id, engin_id, etat, heure_engagement, heure_disponible
        `;
    if (rows.length === 0) return json(res, 404, { error: "Engagement introuvable." });

    await sql`
      UPDATE engins SET statut = ${normalizedEtat}, updated_at = now(), updated_by = ${user.matricule}
      WHERE id = ${rows[0].engin_id}
    `;

    const enginRows = await sql`SELECT nom FROM engins WHERE id = ${rows[0].engin_id}`;
    if (enginRows[0]) {
      const label = VEHICLE_STATUS_LABELS[normalizedEtat] || normalizedEtat;
      await logMessage(sql, rows[0].intervention_id, "Terminal ANTARES BER", `${enginRows[0].nom} - ${label}`);
    }

    return json(res, 200, { moyen: rows[0] });
  }

  if (req.method === "DELETE") {
    const user = requireAuth(req, EDIT_ROLES);
    const id = Number(getQuery(req, "id"));
    if (!id) return json(res, 400, { error: "id manquant." });

    const rows = await sql`DELETE FROM intervention_engins WHERE id = ${id} RETURNING engin_id`;
    if (rows[0]) {
      await sql`
        UPDATE engins SET statut = 'disponible_radio', updated_at = now(), updated_by = ${user.matricule}
        WHERE id = ${rows[0].engin_id}
      `;
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* --------------------------------------------- SERVICES PRÉVENUS - */
async function handleServices(req, res) {
  if (req.method === "POST") {
    requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const intervention_id = Number(body.intervention_id);
    const service_id = Number(body.service_id);
    if (!intervention_id || !service_id) return json(res, 400, { error: "intervention_id et service_id requis." });

    const rows = await sql`
      INSERT INTO intervention_services (intervention_id, service_id)
      VALUES (${intervention_id}, ${service_id})
      ON CONFLICT (intervention_id, service_id) DO NOTHING
      RETURNING intervention_id, service_id, heure_prevenu
    `;
    return json(res, 201, { service: rows[0] ?? null });
  }

  if (req.method === "DELETE") {
    requireAuth(req, EDIT_ROLES);
    const intervention_id = Number(getQuery(req, "intervention_id"));
    const service_id = Number(getQuery(req, "service_id"));
    if (!intervention_id || !service_id) return json(res, 400, { error: "intervention_id et service_id requis." });

    await sql`DELETE FROM intervention_services WHERE intervention_id = ${intervention_id} AND service_id = ${service_id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* -------------------------------------------------------- MESSAGES */
async function handleMessages(req, res) {
  if (req.method === "GET") {
    requireAuth(req);
    const intervention_id = Number(getQuery(req, "intervention_id"));
    if (!intervention_id) return json(res, 400, { error: "intervention_id requis." });

    const rows = await sql`
      SELECT id, auteur, contenu, created_at
      FROM intervention_messages
      WHERE intervention_id = ${intervention_id}
      ORDER BY created_at ASC, id ASC
    `;
    return json(res, 200, { messages: rows });
  }

  if (req.method === "POST") {
    const user = requireAuth(req, EDIT_ROLES);
    const body = getBody(req);
    const intervention_id = Number(body.intervention_id);
    const contenu = String(body.contenu || "").trim();
    if (!intervention_id || !contenu) return json(res, 400, { error: "intervention_id et contenu sont requis." });

    const auteur = body.auteur ? String(body.auteur).trim() : `CO ${user.nom}`;

    const rows = await sql`
      INSERT INTO intervention_messages (intervention_id, auteur, contenu)
      VALUES (${intervention_id}, ${auteur}, ${contenu})
      RETURNING id, auteur, contenu, created_at
    `;
    return json(res, 201, { message: rows[0] });
  }

  return json(res, 405, { error: "Méthode non autorisée." });
}

/* ------------------------------------- ORDRE DE MISSION (Discord) ---- */
// Appelé par "Diffuser l'engagement" une fois les engins engagés :
// envoie UN ordre de mission pour le lot d'engins qui vient d'être diffusé.
async function handleOrdreMission(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Méthode non autorisée." });
  const user = requireAuth(req, EDIT_ROLES);
  const body = getBody(req);
  const intervention_id = Number(body.intervention_id);
  const ids = (Array.isArray(body.engin_ids) ? body.engin_ids : []).map(Number).filter(Boolean);
  if (!intervention_id || !ids.length) return json(res, 400, { error: "intervention_id et engin_ids requis." });

  const interRows = await sql`SELECT * FROM interventions WHERE id = ${intervention_id}`;
  if (!interRows[0]) return json(res, 404, { error: "Intervention introuvable." });

  const engages = await sql`
    SELECT e.id, e.nom, e.caserne AS caserne_nom
    FROM intervention_engins ie
    JOIN engins e ON e.id = ie.engin_id
    WHERE ie.intervention_id = ${intervention_id}
    ORDER BY ie.heure_engagement ASC, ie.id ASC
  `;
  const nouveaux = engages.filter(e => ids.includes(e.id));
  const autres = engages.filter(e => !ids.includes(e.id));
  if (!nouveaux.length) return json(res, 400, { error: "Aucun de ces engins n'est engagé sur cette intervention." });

  const services = await sql`
    SELECT s.nom FROM intervention_services isv
    JOIN services_reference s ON s.id = isv.service_id
    WHERE isv.intervention_id = ${intervention_id}
    ORDER BY isv.heure_prevenu ASC
  `;

  const discord = await envoyerOrdreDiscord({ intervention: interRows[0], nouveaux, autres, services, user });

  if (discord === "ok") {
    await logMessage(sql, intervention_id, `CO ${user.nom}`,
      `Ordre de mission diffusé (${autres.length ? "engins complémentaires" : "premiers départs"}) : ${nouveaux.map(e => e.nom).join(", ")}`);
  }
  return json(res, 200, { discord });
}
