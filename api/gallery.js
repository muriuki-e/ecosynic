const { handleGallery, handleGalleryPhoto } = require('../lib/team-api');

module.exports = (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  return url.searchParams.get('photo') === '1'
    ? handleGalleryPhoto(request, response)
    : handleGallery(request, response);
};
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
