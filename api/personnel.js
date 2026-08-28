const { handler } = require("../netlify/functions/personnel");
module.exports = require("./_adapt")(handler);
