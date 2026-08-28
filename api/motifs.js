const { handler } = require("../netlify/functions/motifs");
module.exports = require("./_adapt")(handler);
