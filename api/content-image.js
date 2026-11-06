const { handleContentImage } = require('../lib/team-api');

module.exports = handleContentImage;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
