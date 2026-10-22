const { handleGallery } = require('../lib/team-api');

module.exports = handleGallery;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
