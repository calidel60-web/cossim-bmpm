// Génère l'image "fiche papier" de l'ordre de mission (style procédure rouge).
// satori (mise en page type HTML/flex -> SVG) + resvg (SVG -> PNG).
// Fichier préfixé "_" : ce n'est pas une fonction Vercel, juste un module.
const fs = require("fs");
const path = require("path");

let fontsCache = null;
function loadFonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(__dirname, "..", "assets", "fonts");
  fontsCache = [
    { name: "Liberation Sans", data: fs.readFileSync(path.join(dir, "LiberationSans-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Liberation Sans", data: fs.readFileSync(path.join(dir, "LiberationSans-Bold.ttf")), weight: 700, style: "normal" },
  ];
  return fontsCache;
}

// Mini-constructeur d'éléments pour satori (pas de JSX).
const el = (style, ...children) => ({
  type: "div",
  props: { style: { display: "flex", flexDirection: "column", ...style }, children: children.flat().filter(c => c !== null && c !== undefined && c !== false) },
});
const row = (style, ...children) => el({ flexDirection: "row", ...style }, ...children);
const label = (txt, extra = {}) => el({ fontSize: 15, ...extra }, txt);
const bold = (txt, extra = {}) => el({ fontWeight: 700, fontSize: 16, ...extra }, txt);

const nomEngin = (e) => `${e.nom}${e.caserne_nom ? ` (${e.caserne_nom})` : ""}`;

async function genererFicheOrdreMission({ intervention, nouveaux, autres, services, user, dt }) {
  const satori = (await import("satori")).default;
  const { Resvg } = require("@resvg/resvg-js");

  const premiers = autres.length === 0;
  const nature = String(intervention.motif || intervention.sinistre || "Nature non précisée");
  const principal = nouveaux[0];
  const complementaires = nouveaux.slice(1);

  const lieu = [
    [intervention.type_voie, intervention.adresse].filter(Boolean).join(" "),
    intervention.commune,
    intervention.arrondissement,
  ].filter(Boolean).join(" ").toUpperCase() || "ADRESSE NON RENSEIGNÉE";

  const validation = `${dt.validation.date} ${dt.validation.time}`;
  const decroche = `${dt.decroche.date} ${dt.decroche.time}`;

  const ligne = (lab, val, extra = {}) =>
    row({ alignItems: "flex-start", marginBottom: 5, ...extra }, label(lab + " ", { marginRight: 8 }), bold(val, { flex: 1 }));

  const tree = el({
    width: 820, boxSizing: "border-box", backgroundColor: "#ffffff", color: "#000000", fontFamily: "Liberation Sans",
    padding: "26px 34px 28px 34px", border: "1px solid #bdbdbd",
  },
    el({ alignItems: "center", fontSize: 14, fontWeight: 700, marginBottom: 8 }, "Mission BSPP - Procédure Rouge"),
    el({ border: "2px solid #000", padding: "7px 10px", alignItems: "center", fontSize: 25, fontWeight: 700, textAlign: "center", marginBottom: 16 },
      `${premiers ? "PREMIERS DÉPARTS" : "ENGINS COMPLÉMENTAIRES"} - ${nature.toUpperCase()} -`),

    el({ fontSize: 30, fontWeight: 700, marginBottom: 2 }, nomEngin(principal)),
    label("accès à l'intervention pour le moyen sélectionné (y compris zdi, multi-adressage etc) :", { fontSize: 13, marginBottom: 4 }),
    el({ fontSize: 22, fontWeight: 700, marginBottom: 14 }, lieu),

    el({ border: "1px solid #000", padding: "9px 12px", marginBottom: 12 },
      row({ justifyContent: "space-between", marginBottom: 5 },
        row({}, label("heure de validation ode : ", { marginRight: 8 }), bold(validation)),
      ),
      ligne("n° intervention :", String(intervention.id).replace(/\B(?=(\d{3})+(?!\d))/g, " ")),
      ligne(premiers ? "1er départ :" : "renfort :", nature),
      ligne("adresse d'intervention :", lieu),
      intervention.etare ? ligne("ETARE :", intervention.etare) : null,
      row({ justifyContent: "space-between", marginTop: 4 },
        row({ flex: 1 }, label("numéro requérant : ", { marginRight: 8 }), bold(intervention.appelant || "—", { flex: 1 })),
        row({}, label("heure de décroché : ", { marginRight: 8 }), bold(decroche)),
      ),
    ),

    label("informations requérants :", { fontSize: 13 }),
    el({ fontSize: 16, fontWeight: 700, marginBottom: 12, marginTop: 2 }, intervention.observation || "—"),

    label("consignes chefs d'agrès :", { fontSize: 13 }),
    el({ border: "1px solid #000", padding: "7px 12px", marginTop: 2, marginBottom: 12, fontSize: 16, fontWeight: 700 },
      intervention.consignes ? el({ marginBottom: 3 }, intervention.consignes) : null,
      el({}, `Sélection manuelle pour : ${principal.nom}`)),

    label("engins complémentaires :", { fontSize: 13 }),
    el({ border: "1px solid #000", padding: "7px 12px", marginTop: 2, fontSize: 16 },
      el({}, complementaires.length ? complementaires.map(nomEngin).join(" ; ") + " ;" : "aucun"),
      autres.length ? el({ marginTop: 5, fontSize: 14 }, `déjà engagés : ${autres.map(e => e.nom).join(" ; ")}`) : null),

    el({ marginTop: 14, fontSize: 11.5, color: "#444" },
      services.length ? el({ marginBottom: 2 }, `Services prévenus : ${services.map(s => s.nom).join(" ; ")}`) : null,
      el({}, `Diffusé par ${[user.grade_code, user.nom].filter(Boolean).join(" ")} (${user.matricule}) — CO BSPP`)),
  );

  const svg = await satori(tree, { width: 820, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: "zoom", value: 2 } }).render().asPng();
  return Buffer.from(png);
}

module.exports = { genererFicheOrdreMission };
