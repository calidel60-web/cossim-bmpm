// Adapte une fonction "Netlify Functions" (exports.handler = async (event) => ...)
// pour qu'elle tourne telle quelle en tant que Serverless Function Vercel
// (module.exports = async (req, res) => ...), sans dupliquer la logique
// métier de netlify/functions/. Garde aussi la compatibilité Netlify si vous
// y revenez un jour : ces fichiers-là ne sont pas modifiés.
module.exports = function adaptNetlifyHandler(handler) {
  return async (req, res) => {
    // Paramètres de requête : Vercel les fournit déjà parsés dans req.query,
    // sinon on les extrait nous-même de l'URL.
    let queryStringParameters = req.query;
    if (!queryStringParameters) {
      try {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        queryStringParameters = Object.fromEntries(url.searchParams.entries());
      } catch {
        queryStringParameters = {};
      }
    }

    // Corps de la requête : Vercel peut déjà l'avoir parsé (req.body), sinon
    // on lit le flux brut nous-même (les fonctions font JSON.parse elles-mêmes).
    let body = "";
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.body !== undefined && req.body !== null && req.body !== "") {
        body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      } else {
        body = await new Promise((resolve, reject) => {
          let data = "";
          req.on("data", (chunk) => { data += chunk; });
          req.on("end", () => resolve(data));
          req.on("error", reject);
        });
      }
    }

    const event = {
      httpMethod: req.method,
      headers: req.headers,
      queryStringParameters,
      body,
    };

    let result;
    try {
      result = await handler(event);
    } catch (e) {
      console.error("Erreur non interceptée :", e);
      result = { statusCode: 500, body: JSON.stringify({ error: "Erreur serveur." }) };
    }

    res.status(result.statusCode || 200);
    if (result.headers) {
      Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
    }
    res.send(result.body ?? "");
  };
};
