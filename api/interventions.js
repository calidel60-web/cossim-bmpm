const { handler } = require("../netlify/functions/interventions");
module.exports = require("./_adapt")(handler);
