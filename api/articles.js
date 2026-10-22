const { handleArticles } = require('../lib/team-api');

module.exports = handleArticles;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
