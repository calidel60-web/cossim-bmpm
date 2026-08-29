const { sql, json, preflight, getBodySafe } = require("./_lib");

const VALID_STATUTS = [
  "en_route", "sur_les_lieux", "message", "message_urgent",
  "transport_ch", "arrive_ch", "disponible_radio", "indisponible", "rentre"
];

function bridgeKey(req) {
  return req.headers["x-cossim-bridge-key"] || req.headers["X-COSSIM-BRIDGE-KEY"] || "";
}

function requireBridge(req) {
  const expected = process.env.COSSIM_FIVEM_KEY;
  if (!expected) {
    const err = new Error("COSSIM_FIVEM_KEY non configurée sur Vercel.");
    err.statusCode = 500;
    throw err;
  }
  if (!bridgeKey(req) || bridgeKey(req) !== expected) {
    const err = new Error("Clé FiveM invalide.");
    err.statusCode = 401;
    throw err;
  }
}

function normalizeIdentifier(value) {
  return String(value || "").trim().slice(0, 150);
}

async function getBinding(identifier) {
  const rows = await sql`
    SELECT fb.identifier, fb.fivem_name, fb.matricule,
           p.id AS personnel_id, p.nom, p.actif
    FROM fivem_bindings fb
    JOIN personnel p ON p.matricule = fb.matricule
    WHERE fb.identifier = ${identifier}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getAssignedEngins(matricule) {
  return await sql`
    SELECT DISTINCT e.id, e.nom, e.categorie
    FROM planning_gardes pg
    JOIN personnel p ON p.id = pg.personnel_id
    JOIN engins e ON e.id = pg.engin_id
    WHERE pg.date_garde = CURRENT_DATE
      AND p.matricule = ${matricule}
    ORDER BY e.ordre ASC, e.nom ASC
  `;
}

async function handleConnect(req, res, body) {
  const identifier = normalizeIdentifier(body.identifier);
  const matricule = String(body.matricule || "").trim();
  const fivemName = String(body.fivem_name || "Joueur FiveM").trim().slice(0, 100);

  if (!identifier || !matricule) {
    return json(res, 400, { error: "identifier et matricule sont requis." });
  }

  const personnel = await sql`
    SELECT matricule, nom, actif
    FROM personnel
    WHERE matricule = ${matricule}
    LIMIT 1
  `;
  if (!personnel.length) return json(res, 404, { error: "Matricule COSSIM introuvable." });
  if (!personnel[0].actif) return json(res, 403, { error: "Ce personnel est désactivé dans COSSIM." });

  // Un compte COSSIM ne reste lié qu'à un seul identifiant FiveM à la fois.
  await sql`DELETE FROM fivem_bindings WHERE matricule = ${matricule} AND identifier <> ${identifier}`;

  const rows = await sql`
    INSERT INTO fivem_bindings (identifier, fivem_name, matricule, last_seen_at)
    VALUES (${identifier}, ${fivemName}, ${matricule}, now())
    ON CONFLICT (identifier)
    DO UPDATE SET fivem_name = ${fivemName}, matricule = ${matricule}, last_seen_at = now()
    RETURNING identifier, fivem_name, matricule, last_seen_at
  `;

  const engins = await getAssignedEngins(matricule);
  return json(res, 200, {
    ok: true,
    binding: rows[0],
    engins,
    message: engins.length === 1
      ? `Connecté à ${matricule} — ${engins[0].nom}.`
      : engins.length === 0
        ? "Compte lié, mais aucun engin n'est affecté à ce matricule pour la garde du jour."
        : "Compte lié, mais plusieurs engins sont affectés à ce matricule aujourd'hui."
  });
}

async function handleStatus(req, res, body) {
  const identifier = normalizeIdentifier(body.identifier);
  const statut = String(body.statut || "").trim();
  if (!identifier || !VALID_STATUTS.includes(statut)) {
    return json(res, 400, { error: "identifier ou statut invalide." });
  }

  const binding = await getBinding(identifier);
  if (!binding) return json(res, 404, { error: "Ce joueur FiveM n'est pas connecté à COSSIM. Utilise /connect MATRICULE." });
  if (!binding.actif) return json(res, 403, { error: "Le compte COSSIM est désactivé." });

  await sql`
    UPDATE fivem_bindings
    SET last_seen_at = now(), fivem_name = ${String(body.fivem_name || binding.fivem_name || "Joueur FiveM").slice(0, 100)}
    WHERE identifier = ${identifier}
  `;

  const engins = await getAssignedEngins(binding.matricule);
  if (engins.length === 0) {
    return json(res, 409, { error: "Aucun engin affecté à ce matricule pour la garde du jour." });
  }
  if (engins.length > 1) {
    return json(res, 409, { error: "Plusieurs engins sont affectés à ce matricule aujourd'hui. Réduis l'affectation à un seul engin." });
  }

  const engin = engins[0];

  // Si l'engin est actuellement engagé, on synchronise également son état
  // sur l'intervention afin que la main courante et le synoptique restent cohérents.
  const active = await sql`
    SELECT ie.id, ie.intervention_id
    FROM intervention_engins ie
    WHERE ie.engin_id = ${engin.id}
      AND ie.etat <> 'rentre'
    ORDER BY ie.heure_engagement DESC
    LIMIT 1
  `;

  if (active.length) {
    if (["disponible_radio", "rentre"].includes(statut)) {
      await sql`
        UPDATE intervention_engins
        SET etat = ${statut}, heure_disponible = now()
        WHERE id = ${active[0].id}
      `;
    } else {
      await sql`
        UPDATE intervention_engins
        SET etat = ${statut}
        WHERE id = ${active[0].id}
      `;
    }
  }

  const current = await sql`SELECT statut FROM engins WHERE id = ${engin.id}`;
  const previous = current[0] && current[0].statut;
  await sql`
    UPDATE engins
    SET statut = ${statut}, updated_at = now(), updated_by = ${binding.matricule}
    WHERE id = ${engin.id}
  `;

  if (previous !== statut) {
    const labels = {
      en_route: "En route", sur_les_lieux: "Sur les lieux", message: "Message",
      message_urgent: "Message Urgent", transport_ch: "Transport CH", arrive_ch: "Arrivé CH",
      disponible_radio: "Disponible Radio", indisponible: "Indisponible", rentre: "Rentré"
    };
    const suffix = binding.fivem_name ? ` (${binding.fivem_name})` : "";
    const interventionId = active.length ? active[0].intervention_id : null;
    if (interventionId) {
      await sql`
        INSERT INTO intervention_messages (intervention_id, auteur, contenu)
        VALUES (${interventionId}, ${`Radio FiveM${suffix}`}, ${`${engin.nom} - ${labels[statut]}`})
      `;
    }
  }

  return json(res, 200, {
    ok: true,
    matricule: binding.matricule,
    engin,
    previous_status: previous,
    statut
  });
}

async function handleDisconnect(req, res, body) {
  const identifier = normalizeIdentifier(body.identifier);
  if (!identifier) return json(res, 400, { error: "identifier requis." });
  await sql`DELETE FROM fivem_bindings WHERE identifier = ${identifier}`;
  return json(res, 200, { ok: true });
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return preflight(res);
  try {
    requireBridge(req);
    if (req.method !== "POST") return json(res, 405, { error: "Méthode non autorisée." });

    const body = await getBodySafe(req);
    const op = String(body.op || "").trim();
    if (op === "connect") return await handleConnect(req, res, body);
    if (op === "status") return await handleStatus(req, res, body);
    if (op === "disconnect") return await handleDisconnect(req, res, body);
    return json(res, 400, { error: "op invalide. Utilise connect, status ou disconnect." });
  } catch (e) {
    return json(res, e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
}

module.exports = handler;

// Désactive le bodyParser JSON automatique de Vercel pour cette fonction :
// PerformHttpRequest (client HTTP de FiveM/CitizenFX) envoie parfois des
// requêtes que ce parseur automatique rejette avant même d'atteindre notre
// code (d'où un 500 avec un corps de réponse totalement vide, impossible
// à diagnostiquer côté client). getBodySafe lit et parse le corps
// manuellement à la place, de façon plus tolérante.
module.exports.config = { api: { bodyParser: false } };
