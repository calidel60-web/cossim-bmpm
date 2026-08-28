const { handler } = require("../netlify/functions/intervention-services");
module.exports = require("./_adapt")(handler);
