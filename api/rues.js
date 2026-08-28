const { handler } = require("../netlify/functions/rues");
module.exports = require("./_adapt")(handler);
