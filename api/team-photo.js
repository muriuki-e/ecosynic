const { handleTeamPhoto } = require('../lib/team-api');

module.exports = handleTeamPhoto;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};