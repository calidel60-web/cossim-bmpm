const { handler } = require("../netlify/functions/services");
module.exports = require("./_adapt")(handler);
