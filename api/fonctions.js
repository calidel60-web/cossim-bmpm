const { handler } = require("../netlify/functions/fonctions");
module.exports = require("./_adapt")(handler);
