const { handler } = require("../netlify/functions/intervention-engins");
module.exports = require("./_adapt")(handler);
