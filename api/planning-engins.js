const { handler } = require("../netlify/functions/planning-engins");
module.exports = require("./_adapt")(handler);
