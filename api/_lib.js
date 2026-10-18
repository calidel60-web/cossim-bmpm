// Module partagé, importé par toutes les fonctions /api/*.js.
// Préfixé par "_" : Vercel ne le transforme PAS en route/fonction.
//
// Différences avec la version Netlify d'origine :
// - les fonctions reçoivent (req, res) au lieu d'un seul `event`
// - `json(res, code, body)` écrit directement la réponse au lieu de la renvoyer
// - `requireAuth(req, roles)` lit `req.headers` au lieu de `event.headers`
// - `getBody(req)` gère le corps déjà parsé par Vercel (objet) ou une chaîne
// - `getQuery(req, key)` lit `req.query` au lieu de `event.queryStringParameters`

const { neon } = require("@neondatabase/serverless");
const jwt = require("jsonwebtoken");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant dans les variables d'environnement Vercel.");
}
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET manquant dans les variables d'environnement Vercel.");
}

// Si DATABASE_URL est absente ou mal formée, neon() peut lever une
// exception dès le chargement du module — avant même d'entrer dans le
// try/catch d'une fonction. Vercel affiche alors une erreur générique
// ("This Serverless Function has crashed") sans détail exploitable.
// On intercepte ce cas ici pour transformer ça en une erreur JSON claire,
// renvoyée normalement au moment de l'appel (donc visible dans le tchat
// du jeu via notify(), sans avoir besoin des logs Vercel).
let sql;
try {
  sql = neon(process.env.DATABASE_URL);
} catch (initError) {
  console.error("Échec d'initialisation de la connexion Neon :", initError.message);
  sql = () => {
    const err = new Error(
      "Connexion base de données impossible : " + initError.message +
      " — vérifie DATABASE_URL sur Vercel."
    );
    err.statusCode = 500;
    throw err;
  };
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

function json(res, statusCode, body) {
  setCors(res);
  res.status(statusCode).json(body);
}

function preflight(res) {
  setCors(res);
  res.status(204).end();
}

function requireAuth(req, allowedRoles = []) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    const err = new Error("Authentification requise.");
    err.statusCode = 401;
    throw err;
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    const err = new Error("Session invalide ou expirée.");
    err.statusCode = 401;
    throw err;
  }

  if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
    const err = new Error("Droits insuffisants pour cette action.");
    err.statusCode = 403;
    throw err;
  }

  return payload; // { matricule, nom, grade_code, role, iat, exp }
}

// Corps de requête : Vercel parse déjà le JSON en objet quand le
// Content-Type est application/json. On reste tolérant si ce n'est pas
// le cas (chaîne brute, ou rien du tout).
function getBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return {}; }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString("utf8") || "{}"); } catch { return {}; }
  }
  return req.body;
}

// Lecture manuelle du corps brut de la requête, pour les fonctions qui
// désactivent le bodyParser automatique de Vercel (voir api/fivem.js).
// Plus tolérant que le parseur intégré face à des clients HTTP "non
// standards" (ex: PerformHttpRequest de FiveM/CitizenFX).
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function getBodySafe(req) {
  // Si le bodyParser Vercel a déjà fait son travail (req.body existe), on
  // le réutilise. Sinon (bodyParser désactivé), on lit le flux nous-mêmes.
  if (req.body !== undefined) return getBody(req);
  const raw = await readRawBody(req);
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// Paramètre de query string : Vercel place tout dans req.query
// (valeur simple, ou tableau si le paramètre est répété).
function getQuery(req, key) {
  const v = req.query ? req.query[key] : undefined;
  return Array.isArray(v) ? v[0] : v;
}

// Postes types par catégorie d'engin, utilisés pour reconstituer l'équipage
// engagé (à partir de la feuille de garde du jour) dans la main courante.
// Doit rester synchronisé avec POSTES_PAR_CATEGORIE côté front (index.html).
const POSTES_PAR_CATEGORIE = {
  VSAV: [["CA_VSAV","Chef d'agrès"], ["COND_VSAV_VL","Conducteur"], ["EQUI_VSAV","Équipier"]],
  FI:   [["CA_FI","Chef d'agrès"], ["COND_FI","Conducteur"],
         ["CHEF_BIN1","Chef binôme 1"], ["EQUI_BIN1","Équipier binôme 1"],
         ["CHEF_BIN2","Chef binôme 2"], ["EQUI_BIN2","Équipier binôme 2"]],
  VPI:  [["CA_VPI","Chef d'agrès"], ["COND_VPI","Conducteur"], ["EQUI_VPI","Équipier"]],
  VRCG: [["CDG","Chef de groupe"], ["COND_VL/HR","Conducteur"]],
  VRCC: [["CDC","Chef de colonne"], ["COND_VL/HR","Conducteur"]],
  CCF:  [["CA_CCF","Chef d'agrès"], ["COND_CCF","Conducteur"], ["EQUI_CCF","Équipier"]],
  MEA:  [["CA_MEA","Chef d'agrès"], ["COND_MEA","Conducteur"], ["EQU_MEA","Équipier"]],
  CSR:  [["CA_SR","Chef d'agrès"], ["COND_SR","Conducteur"], ["EQU_SR","Équipier"]],
};

async function buildEngagementMessage(sql, enginNom, enginCategorie, enginId) {
  const postes = POSTES_PAR_CATEGORIE[enginCategorie] || [];
  let affectations = [];
  if (postes.length) {
    const today = new Date().toISOString().slice(0, 10);
    affectations = await sql`
      SELECT pg.poste_code, p.nom AS personnel_nom
      FROM planning_gardes pg
      LEFT JOIN personnel p ON p.id = pg.personnel_id
      WHERE pg.date_garde = ${today} AND pg.engin_id = ${enginId}
    `;
  }
  const parNom = {};
  affectations.forEach(a => { parNom[a.poste_code] = a.personnel_nom; });

  const lignes = postes.map(([code]) => parNom[code] ? `${code} - ${parNom[code].toUpperCase()}` : "-");
  return `ENGAGEMENT ${enginNom}\n\n${lignes.join("\n")}`;
}

async function logMessage(sql, intervention_id, auteur, contenu) {
  await sql`
    INSERT INTO intervention_messages (intervention_id, auteur, contenu)
    VALUES (${intervention_id}, ${auteur}, ${contenu})
  `;
}

// Envoie (ou remplace) l'ordre de mission du CA d'un engin engagé, sur le
// site externe de la tablette VSAV (autre déploiement, table
// `ordres_mission` partagée). Ne casse jamais l'engagement en cours si
// l'envoi échoue : on journalise seulement l'erreur côté serveur.
async function envoyerOrdreMission(sql, intervention, engin, engagesAffichage) {
  const baseUrl = process.env.VSAV_SITE_URL;
  if (!baseUrl) {
    console.error("VSAV_SITE_URL non configurée : ordre de mission non envoyé.");
    return;
  }

  const postes = POSTES_PAR_CATEGORIE[engin.categorie];
  const posteCA = postes && postes[0] && postes[0][0];
  if (!posteCA) return;

  const today = new Date().toISOString().slice(0, 10);
  const affect = await sql`
    SELECT p.matricule
    FROM planning_gardes pg
    JOIN personnel p ON p.id = pg.personnel_id
    WHERE pg.date_garde = ${today} AND pg.engin_id = ${engin.id} AND pg.poste_code = ${posteCA}
  `;
  const targetMatricule = affect[0] && affect[0].matricule;
  if (!targetMatricule) return;

  const t = parisDateTime();
  const lieu = formatLieu(intervention);

  const missionData = {
    date: t.date,
    dateShort: t.dateShort,
    time: t.time,
    interNum: String(intervention.id),
    nature: intervention.motif || intervention.sinistre || "",
    engins: engagesAffichage.join(", "),
    adresse: lieu,
    observations: intervention.observation || "",
  };

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/.netlify/functions/save-mission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_matricule: targetMatricule, data: missionData }),
    });
    if (!res.ok) console.error("Échec envoi ordre de mission VSAV :", res.status, await res.text());
  } catch (e) {
    console.error("Erreur réseau lors de l'envoi de l'ordre de mission VSAV :", e.message);
  }
}


// Date/heure à Paris (les fonctions Vercel tournent en UTC).
function parisDateTime(d = new Date()) {
  const f = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return {
    date: `${p.day}/${p.month}/${p.year}`,
    dateShort: `${p.day}/${p.month}/${p.year.slice(-2)}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
  };
}

function formatLieu(intervention) {
  return [
    [intervention.type_voie, intervention.adresse].filter(Boolean).join(" "),
    intervention.commune,
    intervention.arrondissement ? `(${intervention.arrondissement})` : null,
  ].filter(Boolean).join(", ");
}

function trunc(str, max) {
  const t = String(str ?? "");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Envoie l'ordre de mission sur Discord (webhook DISCORD_WEBHOOK_URL).
// Retourne "ok" | "non_configure" | "echec". Ne lève jamais d'exception :
// un souci Discord ne doit pas bloquer l'engagement.
async function envoyerOrdreDiscord({ intervention, nouveaux, autres, services, user }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return "non_configure";

  const premiers = autres.length === 0;
  const t = parisDateTime();
  const lieu = formatLieu(intervention) || "Adresse non renseignée";
  const nature = intervention.motif || intervention.sinistre || "Nature non précisée";
  const ligne = (e) => `• **${e.nom}**${e.caserne_nom ? ` — ${e.caserne_nom}` : ""}`;

  const fields = [
    { name: "🕒 Heure de validation", value: `${t.date} ${t.time}`, inline: true },
    { name: "N° intervention", value: String(intervention.id), inline: true },
    { name: premiers ? "🚒 Départ" : "🚒 Engins complémentaires",
      value: trunc(nouveaux.map(ligne).join("\n"), 1024) },
  ];
  if (autres.length) fields.push({ name: "Déjà engagés", value: trunc(autres.map(e => e.nom).join(" ; "), 1024) });
  if (intervention.appelant) fields.push({ name: "📞 Requérant", value: trunc(intervention.appelant, 1024), inline: true });
  if (intervention.etare) fields.push({ name: "ETARE", value: trunc(intervention.etare, 1024), inline: true });
  if (intervention.observation) fields.push({ name: "ℹ️ Informations requérant", value: trunc(intervention.observation, 1024) });
  if (intervention.consignes) fields.push({ name: "Consignes", value: trunc(intervention.consignes, 1024) });
  if (services.length) fields.push({ name: "Services prévenus", value: trunc(services.map(x => x.nom).join(" ; "), 1024) });
  fields.push({ name: "Diffusé par", value: trunc(`${user.grade_code || ""} ${user.nom} (${user.matricule})`.trim(), 1024) });

  const payload = {
    username: "CO BSPP",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: trunc(`ORDRE DE MISSION — INTER n° ${intervention.id}`, 256),
      description: trunc(`**${premiers ? "PREMIERS DÉPARTS" : "ENGINS COMPLÉMENTAIRES"} — ${String(nature).toUpperCase()}**\n📍 **${lieu}**`, 4096),
      color: 0xC0272D,
      fields,
      footer: { text: "CO BSPP" },
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("Échec webhook Discord :", res.status, await res.text());
      return "echec";
    }
    return "ok";
  } catch (e) {
    console.error("Erreur réseau webhook Discord :", e.message);
    return "echec";
  }
}

const VEHICLE_STATUS_LABELS = {
  alerte: "Alerté", en_route: "En route", sur_les_lieux: "Sur les lieux",
  message: "Message", message_urgent: "Message Urgent", transport_ch: "Transport CH",
  arrive_ch: "Arrivé CH", disponible_radio: "Disponible Radio",
  indisponible: "Indisponible", rentre: "Rentré",
};

module.exports = {
  sql, json, preflight, requireAuth, getBody, getBodySafe, getQuery,
  POSTES_PAR_CATEGORIE, buildEngagementMessage, logMessage, VEHICLE_STATUS_LABELS,
  envoyerOrdreMission, envoyerOrdreDiscord,
};
