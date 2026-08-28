const { handler } = require("../netlify/functions/engins");
module.exports = require("./_adapt")(handler);
