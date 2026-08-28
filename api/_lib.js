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

const sql = neon(process.env.DATABASE_URL);

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
  return req.body;
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

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const lieu = [
    [intervention.type_voie, intervention.adresse].filter(Boolean).join(" "),
    intervention.commune,
    intervention.arrondissement ? `(${intervention.arrondissement})` : null,
  ].filter(Boolean).join(", ");

  const missionData = {
    date: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
    dateShort: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
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

const VEHICLE_STATUS_LABELS = {
  alerte: "Alerté", en_route: "En route", sur_les_lieux: "Sur les lieux",
  message: "Message", message_urgent: "Message Urgent", transport_ch: "Transport CH",
  arrive_ch: "Arrivé CH", disponible_radio: "Disponible Radio",
  indisponible: "Indisponible", rentre: "Rentré",
};

module.exports = {
  sql, json, preflight, requireAuth, getBody, getQuery,
  POSTES_PAR_CATEGORIE, buildEngagementMessage, logMessage, VEHICLE_STATUS_LABELS,
  envoyerOrdreMission,
};
