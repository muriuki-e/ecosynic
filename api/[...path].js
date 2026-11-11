const {
  handleAdmin,
  handleArticles,
  handleArticleImage,
  handleContent,
  handleContentImage,
  handleGallery,
  handleGalleryPhoto,
  handleSiteStatus,
  handleTeam,
  handleTeamPhoto,
} = require('../lib/team-api');
const { handleNewsletter, unsubscribe } = require('../lib/newsletter-api');
const { handleAdvice, handleContact, handleForecast } = require('../server');

const routes = {
  '/api/admin': handleAdmin,
  '/api/team': handleTeam,
  '/api/team-photo': handleTeamPhoto,
  '/api/site-status': handleSiteStatus,
  '/api/content': handleContent,
  '/api/content-image': handleContentImage,
  '/api/articles': handleArticles,
  '/api/article-image': handleArticleImage,
  '/api/gallery': handleGallery,
  '/api/gallery-photo': handleGalleryPhoto,
  '/api/contact': handleContact,
  '/api/newsletter': handleNewsletter,
  '/api/newsletter-unsubscribe': unsubscribe,
  '/api/forecast': handleForecast,
  '/api/advice': handleAdvice,
};

module.exports = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const handler = routes[url.pathname];
  if (!handler) {
    response.writeHead(404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify({ error: 'Route not found.' }));
    return;
  }
  if (url.pathname === '/api/articles' && url.searchParams.get('image') === '1') {
    await handleArticleImage(request, response);
    return;
  }
  if (url.pathname === '/api/gallery' && url.searchParams.get('photo') === '1') {
    await handleGalleryPhoto(request, response);
    return;
  }
  await handler(request, response);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
