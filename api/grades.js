const { handler } = require("../netlify/functions/grades");
module.exports = require("./_adapt")(handler);
