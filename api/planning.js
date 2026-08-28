const { handler } = require("../netlify/functions/planning");
module.exports = require("./_adapt")(handler);
