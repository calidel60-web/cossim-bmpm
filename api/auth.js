const { handler } = require("../netlify/functions/auth");
module.exports = require("./_adapt")(handler);
