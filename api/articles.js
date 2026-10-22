const { handleArticles, handleArticleImage } = require('../lib/team-api');

module.exports = (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  return url.searchParams.get('image') === '1'
    ? handleArticleImage(request, response)
    : handleArticles(request, response);
};
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
