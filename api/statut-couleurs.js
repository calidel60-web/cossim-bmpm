const { handler } = require("../netlify/functions/statut-couleurs");
module.exports = require("./_adapt")(handler);
