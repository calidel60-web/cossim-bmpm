const { sql, json, preflight, requireAuth } = require("./_lib");

// Couleurs par défaut (utilisées si l'admin n'a encore rien personnalisé,
// ou pour un statut qui n'aurait pas encore de ligne en base).
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    // Lecture : accessible à tout utilisateur connecté (nécessaire pour
    // afficher correctement le synoptique des engins et les chips).
    if (event.httpMethod === "GET") {
      requireAuth(event);
      const rows = await sql`SELECT statut_code, couleur FROM statut_couleurs`;
      const colors = { ...DEFAULT_COLORS };
      rows.forEach((r) => { colors[r.statut_code] = r.couleur; });
      return json(200, { colors, defaults: DEFAULT_COLORS });
    }

    // Mise à jour : admin uniquement. Body : { colors: { statut_code: "#RRGGBB", ... } }
    if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
      requireAuth(event, ["admin"]);
      const body = JSON.parse(event.body || "{}");
      const colors = body.colors || {};

      const entries = Object.entries(colors).filter(([code, hex]) =>
        Object.prototype.hasOwnProperty.call(DEFAULT_COLORS, code) && HEX_RE.test(hex)
      );
      if (entries.length === 0) {
        return json(400, { error: "Aucune couleur valide fournie (format attendu : #RRGGBB)." });
      }

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
      return json(200, { colors: merged });
    }

    // Réinitialiser une couleur (ou toutes) aux valeurs par défaut : admin uniquement.
    if (event.httpMethod === "DELETE") {
      requireAuth(event, ["admin"]);
      const code = event.queryStringParameters && event.queryStringParameters.statut;
      if (code) {
        await sql`DELETE FROM statut_couleurs WHERE statut_code = ${code}`;
      } else {
        await sql`DELETE FROM statut_couleurs`;
      }
      return json(200, { ok: true });
    }

    return json(405, { error: "Méthode non autorisée." });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Erreur serveur." });
  }
};
