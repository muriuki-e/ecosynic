const { handleArticleImage } = require('../lib/team-api');

module.exports = handleArticleImage;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
