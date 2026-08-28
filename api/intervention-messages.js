const { handler } = require("../netlify/functions/intervention-messages");
module.exports = require("./_adapt")(handler);
