const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const COOKIE_NAME = 'ecosynic_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 64_000;
const MAX_PHOTO_BYTES = 4_000_000;
const MAX_CONTENT_BYTES = 600_000;
const TEAM_FILE = 'team/profiles.json';
const CONTENT_FILE = 'site/content.json';
const GALLERY_FILE = 'gallery/images.json';
const ARTICLES_FILE = 'articles/entries.json';
const LOCAL_DATA = path.join(__dirname, '..', '.data');
const LOCAL_TEAM_FILE = path.join(LOCAL_DATA, 'team.json');
const LOCAL_CONTENT_FILE = path.join(LOCAL_DATA, 'site-content.json');
const LOCAL_PHOTO_DIR = path.join(LOCAL_DATA, 'team-photos');
const LOCAL_GALLERY_FILE = path.join(LOCAL_DATA, 'gallery.json');
const LOCAL_GALLERY_PHOTO_DIR = path.join(LOCAL_DATA, 'gallery-photos');
const LOCAL_ARTICLES_FILE = path.join(LOCAL_DATA, 'articles.json');
const LOCAL_ARTICLE_PHOTO_DIR = path.join(LOCAL_DATA, 'article-photos');
const CONTENT_PAGES = new Set([
  'index',
  'staff',
  'gallery',
  'articles',
  'climate-resilience',
  'smart-agriculture',
  'newsletter',
  'newsletter-unsubscribe',
  'green-livelihoods',
  'get-involved',
  'geographic-scope',
  'community-leadership',
  'climate-technology',
  'ecosystem-restoration',
  'faq',
]);
const imageTypes = {
  'image/jpeg': { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  'image/png': { extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'image/webp': { extension: 'webp', signature: [0x52, 0x49, 0x46, 0x46] },
};

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function isVercel() {
  return process.env.VERCEL === '1';
}

function storageReady() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function cookieValue(request) {
  const cookies = request.headers.cookie || '';
  const match = cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : '';
}

function sign(payload) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}

function hasAdminSession(request) {
  if (!process.env.ADMIN_SESSION_SECRET) return false;
  const token = cookieValue(request);
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function requireSameOrigin(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === request.headers.host) return true;
  } catch {
    // Reject malformed origins.
  }
  sendJson(response, 403, { error: 'This request is not allowed.' });
  return false;
}

function requireAdmin(request, response, message = 'Sign in to manage the admin dashboard.') {
  if (hasAdminSession(request)) return true;
  sendJson(response, 401, { error: message });
  return false;
}

async function readBody(request, limit = MAX_JSON_BYTES) {
  if (request.body !== undefined) {
    if (Buffer.isBuffer(request.body)) {
      if (request.body.length > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
      return request.body;
    }
    if (typeof request.body === 'string') {
      const body = Buffer.from(request.body);
      if (body.length > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
      return body;
    }
    if (request.body && typeof request.body === 'object') return Buffer.from(JSON.stringify(request.body));
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request, limit = MAX_JSON_BYTES) {
  const buffer = await readBody(request, limit);
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

async function getBlobSdk() {
  return import('@vercel/blob');
}

async function loadProfiles() {
  if (!isVercel()) {
    try {
      return JSON.parse(await fs.readFile(LOCAL_TEAM_FILE, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable team management.');
  const { get } = await getBlobSdk();
  const result = await get(TEAM_FILE, { access: 'private', useCache: false });
  if (!result) return [];
  return JSON.parse(await new Response(result.stream).text());
}

async function saveProfiles(profiles) {
  const data = JSON.stringify(profiles);
  if (Buffer.byteLength(data) > 300_000) throw Object.assign(new Error('The team directory is too large.'), { status: 413 });
  if (!isVercel()) {
    await fs.mkdir(LOCAL_DATA, { recursive: true });
    await fs.writeFile(LOCAL_TEAM_FILE, data, 'utf8');
    return;
  }

  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable team management.');
  const { put } = await getBlobSdk();
  await put(TEAM_FILE, data, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60,
  });
}

async function loadSiteContent() {
  if (!isVercel()) {
    try {
      return JSON.parse(await fs.readFile(LOCAL_CONTENT_FILE, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { overrides: {}, sections: {} };
      throw error;
    }
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable website content editing.');
  const { get } = await getBlobSdk();
  const result = await get(CONTENT_FILE, { access: 'private', useCache: false });
  if (!result) return { overrides: {}, sections: {} };
  return JSON.parse(await new Response(result.stream).text());
}

function validateSiteContent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !body.overrides || typeof body.overrides !== 'object' || Array.isArray(body.overrides)
    || !body.sections || typeof body.sections !== 'object' || Array.isArray(body.sections)) {
    throw Object.assign(new Error('Website content has an invalid format.'), { status: 400 });
  }
  const content = { overrides: {}, sections: {} };
  for (const page of CONTENT_PAGES) {
    const pageOverrides = body.overrides[page] || {};
    const pageSections = body.sections[page] || [];
    if (!pageOverrides || typeof pageOverrides !== 'object' || Array.isArray(pageOverrides) || !Array.isArray(pageSections)) {
      throw Object.assign(new Error('Website content has an invalid format.'), { status: 400 });
    }
    const overrides = {};
    for (const [key, value] of Object.entries(pageOverrides)) {
      if (!/^(?:\d+\.)*\d+$/.test(key) || typeof value !== 'string' || value.length > 10_000) {
        throw Object.assign(new Error('A website text value is invalid or too long.'), { status: 400 });
      }
      overrides[key] = value;
    }
    if (pageSections.length > 40) throw Object.assign(new Error('A page can contain up to 40 added sections.'), { status: 400 });
    const sections = pageSections.map((section) => {
      if (!section || typeof section !== 'object' || typeof section.id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(section.id)
        || typeof section.title !== 'string' || !section.title.trim() || section.title.trim().length > 120
        || typeof section.body !== 'string' || section.body.length > 5_000) {
        throw Object.assign(new Error('An added section is invalid or too long.'), { status: 400 });
      }
      return { id: section.id, title: section.title.trim(), body: section.body.trim() };
    });
    content.overrides[page] = overrides;
    content.sections[page] = sections;
  }
  if (Buffer.byteLength(JSON.stringify(content)) > MAX_CONTENT_BYTES) {
    throw Object.assign(new Error('Website content is too large to save.'), { status: 413 });
  }
  return content;
}

async function saveSiteContent(content) {
  const data = JSON.stringify(content);
  if (Buffer.byteLength(data) > MAX_CONTENT_BYTES) {
    throw Object.assign(new Error('Website content is too large to save.'), { status: 413 });
  }
  if (!isVercel()) {
    await fs.mkdir(LOCAL_DATA, { recursive: true });
    await fs.writeFile(LOCAL_CONTENT_FILE, data, 'utf8');
    return;
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable website content editing.');
  const { put } = await getBlobSdk();
  await put(CONTENT_FILE, data, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0,
  });
}

async function loadGallery() {
  if (!isVercel()) {
    try {
      return JSON.parse(await fs.readFile(LOCAL_GALLERY_FILE, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable gallery management.');
  const { get } = await getBlobSdk();
  const result = await get(GALLERY_FILE, { access: 'private', useCache: false });
  if (!result) return [];
  return JSON.parse(await new Response(result.stream).text());
}

async function saveGallery(images) {
  const data = JSON.stringify(images);
  if (Buffer.byteLength(data) > MAX_CONTENT_BYTES) {
    throw Object.assign(new Error('The gallery is too large to save.'), { status: 413 });
  }
  if (!isVercel()) {
    await fs.mkdir(LOCAL_DATA, { recursive: true });
    await fs.writeFile(LOCAL_GALLERY_FILE, data, 'utf8');
    return;
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable gallery management.');
  const { put } = await getBlobSdk();
  await put(GALLERY_FILE, data, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0,
  });
}

async function loadArticles() {
  if (!isVercel()) {
    try {
      return JSON.parse(await fs.readFile(LOCAL_ARTICLES_FILE, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable articles and news.');
  const { get } = await getBlobSdk();
  const result = await get(ARTICLES_FILE, { access: 'private', useCache: false });
  if (!result) return [];
  return JSON.parse(await new Response(result.stream).text());
}

async function saveArticles(articles) {
  const data = JSON.stringify(articles);
  if (Buffer.byteLength(data) > MAX_CONTENT_BYTES) {
    throw Object.assign(new Error('Articles and news content is too large to save.'), { status: 413 });
  }
  if (!isVercel()) {
    await fs.mkdir(LOCAL_DATA, { recursive: true });
    await fs.writeFile(LOCAL_ARTICLES_FILE, data, 'utf8');
    return;
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable articles and news.');
  const { put } = await getBlobSdk();
  await put(ARTICLES_FILE, data, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0,
  });
}

function validateArticle(body, current = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Article details are invalid.'), { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const type = body.type;
  const status = body.status;
  const date = body.date;
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
  const imagePath = typeof body.imagePath === 'string' ? body.imagePath : '';
  const imageAlt = typeof body.imageAlt === 'string' ? body.imageAlt.trim() : '';
  const videoUrl = normalizeYouTubeUrl(body.videoUrl);
  if (!title || title.length > 160 || !summary || summary.length > 320
    || !content || content.length > 12_000) {
    throw Object.assign(new Error('Add a title, summary and story. Keep the title under 160 characters, summary under 320, and story under 12,000.'), { status: 400 });
  }
  if (!['news', 'event'].includes(type)
    || (type === 'news' && status !== 'published')
    || (type === 'event' && !['upcoming', 'past'].includes(status))) {
    throw Object.assign(new Error('Choose news or an event, then set a valid event status.'), { status: 400 });
  }
  const parsedDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00.000Z`)
    : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error('Choose a valid publication or event date.'), { status: 400 });
  }
  if (imageUrl || imagePath || imageAlt) {
    const localPath = /^article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(imagePath);
    const blobPath = /^articles\/photos\/article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(imagePath);
    if (!imageAlt || imageAlt.length > 200
      || imageUrl !== `/api/article-image?path=${encodeURIComponent(imagePath)}`
      || (isVercel() ? !blobPath : !localPath)) {
      throw Object.assign(new Error('Upload an image with a description of 200 characters or fewer.'), { status: 400 });
    }
  }
  if (body.videoUrl && !videoUrl) {
    throw Object.assign(new Error('Enter a valid YouTube video link.'), { status: 400 });
  }
  if (videoUrl && type !== 'event') {
    throw Object.assign(new Error('YouTube videos can only be attached to events.'), { status: 400 });
  }
  return {
    id: current?.id || crypto.randomUUID(),
    title,
    summary,
    content,
    type,
    status,
    date,
    imageUrl,
    imagePath,
    imageAlt,
    videoUrl,
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeYouTubeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
      else videoId = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : '';
  } catch {
    return '';
  }
}

async function handleArticles(request, response) {
  if (request.method === 'GET') {
    try {
      sendJson(response, 200, { articles: await loadArticles() });
    } catch (error) {
      sendJson(response, 503, { error: error.message || 'Articles and news are unavailable.' });
    }
    return;
  }
  if (!['POST', 'PUT', 'DELETE'].includes(request.method)) {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response)) return;

  const url = requestUrl(request);
  try {
    const articles = await loadArticles();
    if (request.method === 'DELETE') {
      const index = articles.findIndex((article) => article.id === url.searchParams.get('id'));
      if (index < 0) {
        sendJson(response, 404, { error: 'Article not found.' });
        return;
      }
      const [removed] = articles.splice(index, 1);
      await saveArticles(articles);
      if (removed.imagePath) await deleteArticlePhoto(removed.imagePath);
      sendJson(response, 200, { articles });
      return;
    }

    const body = await readJson(request, MAX_CONTENT_BYTES);
    if (request.method === 'POST') {
      if (articles.length >= 200) {
        sendJson(response, 413, { error: 'The news and events page can contain up to 200 entries.' });
        return;
      }
      articles.push(validateArticle(body));
    } else {
      const index = articles.findIndex((article) => article.id === url.searchParams.get('id'));
      if (index < 0) {
        sendJson(response, 404, { error: 'Article not found.' });
        return;
      }
      const previous = articles[index];
      articles[index] = validateArticle(body, previous);
      await saveArticles(articles);
      if (previous.imagePath && previous.imagePath !== articles[index].imagePath) {
        await deleteArticlePhoto(previous.imagePath);
      }
      sendJson(response, 200, { articles });
      return;
    }
    await saveArticles(articles);
    sendJson(response, request.method === 'POST' ? 201 : 200, { articles });
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : 'Could not save articles and news.',
    });
  }
}

async function handleArticleImage(request, response) {
  const url = requestUrl(request);
  if (request.method === 'GET') {
    const pathname = url.searchParams.get('path') || '';
    if (!/^article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)
      && !/^articles\/photos\/article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
      sendJson(response, 404, { error: 'Image not found.' });
      return;
    }
    await servePhoto(request, response, pathname, LOCAL_ARTICLE_PHOTO_DIR, 'Article image');
    return;
  }
  if (!['POST', 'DELETE'].includes(request.method)) {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response)) return;

  if (request.method === 'DELETE') {
    const pathname = url.searchParams.get('path') || '';
    if (!/^article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)
      && !/^articles\/photos\/article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
      sendJson(response, 400, { error: 'The image path is invalid.' });
      return;
    }
    try {
      await deleteArticlePhoto(pathname);
      sendJson(response, 200, { deleted: true });
    } catch (error) {
      sendJson(response, 500, { error: 'Could not remove the unused article image.' });
    }
    return;
  }

  const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
  const imageType = imageTypes[contentType];
  if (!imageType) {
    sendJson(response, 415, { error: 'Choose a JPEG, PNG, or WebP image.' });
    return;
  }
  try {
    const image = await readBody(request, MAX_PHOTO_BYTES);
    const signature = imageType.signature;
    const valid = image.length >= signature.length && signature.every((byte, index) => image[index] === byte);
    if (!valid || (contentType === 'image/webp' && image.toString('ascii', 8, 12) !== 'WEBP')) {
      sendJson(response, 400, { error: 'The file contents do not match the selected image type.' });
      return;
    }
    if (isVercel() && !storageReady()) {
      sendJson(response, 503, { error: 'Connect a Vercel Blob store before uploading article images.' });
      return;
    }

    const fileName = `article-${crypto.randomUUID()}.${imageType.extension}`;
    let pathname = fileName;
    if (!isVercel()) {
      await fs.mkdir(LOCAL_ARTICLE_PHOTO_DIR, { recursive: true });
      await fs.writeFile(path.join(LOCAL_ARTICLE_PHOTO_DIR, fileName), image);
    } else {
      pathname = `articles/photos/${fileName}`;
      const { put } = await getBlobSdk();
      await put(pathname, image, {
        access: 'private',
        addRandomSuffix: false,
        contentType,
        cacheControlMaxAge: 31536000,
      });
    }
    sendJson(response, 201, {
      url: `/api/article-image?path=${encodeURIComponent(pathname)}`,
      path: pathname,
    });
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : 'Could not upload this article image.',
    });
  }
}

function validateGalleryImage(image) {
  if (!image || typeof image !== 'object' || typeof image.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(image.id)
    || typeof image.alt !== 'string' || !image.alt.trim() || image.alt.trim().length > 200
    || typeof image.url !== 'string' || typeof image.path !== 'string'
    || typeof image.createdAt !== 'string') {
    throw Object.assign(new Error('A gallery image is invalid.'), { status: 400 });
  }
  const localPath = /^gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(image.path);
  const blobPath = /^gallery\/photos\/gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(image.path);
  const validUrl = image.url === `/api/gallery-photo?path=${encodeURIComponent(image.path)}`;
  if (!validUrl || (isVercel() ? !blobPath : !localPath)) {
    throw Object.assign(new Error('Upload a valid gallery image before saving.'), { status: 400 });
  }
  return {
    id: image.id,
    alt: image.alt.trim(),
    url: image.url,
    path: image.path,
    createdAt: image.createdAt,
  };
}

async function handleGallery(request, response) {
  if (request.method === 'GET') {
    try {
      sendJson(response, 200, { images: await loadGallery() });
    } catch (error) {
      sendJson(response, 503, { error: error.message || 'The gallery is unavailable.' });
    }
    return;
  }
  if (!['POST', 'DELETE'].includes(request.method)) {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response)) return;

  const url = requestUrl(request);
  if (request.method === 'DELETE') {
    try {
      const images = await loadGallery();
      const index = images.findIndex((image) => image.id === url.searchParams.get('id'));
      if (index < 0) {
        sendJson(response, 404, { error: 'Gallery image not found.' });
        return;
      }
      const [removed] = images.splice(index, 1);
      await saveGallery(images);
      await deleteGalleryPhoto(removed.path);
      sendJson(response, 200, { images });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.status ? error.message : 'Could not remove this gallery image.' });
    }
    return;
  }

  const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
  const imageType = imageTypes[contentType];
  let alt = '';
  try {
    alt = decodeURIComponent(typeof request.headers['x-gallery-alt'] === 'string' ? request.headers['x-gallery-alt'] : '').trim();
  } catch {
    sendJson(response, 400, { error: 'The image description is invalid.' });
    return;
  }
  if (!imageType) {
    sendJson(response, 415, { error: 'Choose a JPEG, PNG, or WebP image.' });
    return;
  }
  if (!alt || alt.length > 200) {
    sendJson(response, 400, { error: 'Add descriptive alt text of 200 characters or fewer.' });
    return;
  }
  try {
    const image = await readBody(request, MAX_PHOTO_BYTES);
    const signature = imageType.signature;
    const valid = image.length >= signature.length && signature.every((byte, index) => image[index] === byte);
    if (!valid || (contentType === 'image/webp' && image.toString('ascii', 8, 12) !== 'WEBP')) {
      sendJson(response, 400, { error: 'The file contents do not match the selected image type.' });
      return;
    }
    if (isVercel() && !storageReady()) {
      sendJson(response, 503, { error: 'Connect a Vercel Blob store before uploading gallery images.' });
      return;
    }

    const id = crypto.randomUUID();
    const fileName = `gallery-${id}.${imageType.extension}`;
    let pathname = fileName;
    if (!isVercel()) {
      await fs.mkdir(LOCAL_GALLERY_PHOTO_DIR, { recursive: true });
      await fs.writeFile(path.join(LOCAL_GALLERY_PHOTO_DIR, fileName), image);
    } else {
      pathname = `gallery/photos/${fileName}`;
      const { put } = await getBlobSdk();
      await put(pathname, image, {
        access: 'private',
        addRandomSuffix: false,
        contentType,
        cacheControlMaxAge: 31536000,
      });
    }
    const entry = {
      id,
      alt,
      url: `/api/gallery-photo?path=${encodeURIComponent(pathname)}`,
      path: pathname,
      createdAt: new Date().toISOString(),
    };
    const images = await loadGallery();
    images.push(validateGalleryImage(entry));
    try {
      await saveGallery(images);
    } catch (error) {
      await deleteGalleryPhoto(pathname).catch(() => {});
      throw error;
    }
    sendJson(response, 201, { images });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'Could not upload this gallery image.' });
  }
}

async function handleContent(request, response) {
  if (request.method === 'GET') {
    try {
      sendJson(response, 200, await loadSiteContent());
    } catch (error) {
      sendJson(response, 503, { error: error.message || 'Website content is unavailable.' });
    }
    return;
  }
  if (request.method !== 'PUT') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response)) return;
  try {
    const content = validateSiteContent(await readJson(request, MAX_CONTENT_BYTES));
    await saveSiteContent(content);
    sendJson(response, 200, { saved: true });
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : 'Could not save website content.',
    });
  }
}

function validateProfile(body, current = null) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl : '';
  const photoPath = typeof body.photoPath === 'string' ? body.photoPath : '';
  if (!name || name.length > 100 || !role || role.length > 100) {
    throw Object.assign(new Error('Enter a name and role, each 100 characters or fewer.'), { status: 400 });
  }
  if (phone.length > 40 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw Object.assign(new Error('Check the phone number and email address.'), { status: 400 });
  }
  if (!phone && !email) throw Object.assign(new Error('Add at least one contact method.'), { status: 400 });

  const retainedPhotoUrl = photoUrl || current?.photoUrl || '';
  const retainedPhotoPath = photoPath || current?.photoPath || '';
  if (retainedPhotoUrl && !isValidPhoto(retainedPhotoUrl, retainedPhotoPath)) {
    throw Object.assign(new Error('Upload a valid team photo before saving.'), { status: 400 });
  }
  if (!retainedPhotoUrl) throw Object.assign(new Error('Upload a team photo before saving.'), { status: 400 });
  return {
    id: current?.id || crypto.randomUUID(),
    name,
    role,
    phone,
    email,
    photoUrl: retainedPhotoUrl,
    photoPath: retainedPhotoPath,
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isValidPhoto(url, pathname) {
  if (!url || !pathname) return false;
  if (!isVercel()) return url.startsWith('/api/team-photo?path=') && /^team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname);
  if (url.startsWith('/api/team-photo?path=')) {
    try {
      const parsed = new URL(url, 'https://ecosynic.or.ke');
      return parsed.pathname === '/api/team-photo'
        && parsed.searchParams.get('path') === pathname
        && /^team\/photos\/team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname);
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.public.blob.vercel-storage.com') && pathname.startsWith('team/photos/');
  } catch {
    return false;
  }
}

function requestUrl(request) {
  return new URL(request.url, `http://${request.headers.host || 'localhost'}`);
}

async function handleAdmin(request, response) {
  const url = requestUrl(request);
  if (request.method === 'GET' && url.pathname === '/api/admin') {
    sendJson(response, 200, { authenticated: hasAdminSession(request), storageReady: !isVercel() || storageReady() });
    return;
  }
  if (request.method !== 'POST' || !requireSameOrigin(request, response)) {
    if (request.method !== 'POST') sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (url.searchParams.get('action') === 'logout') {
    response.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isVercel() ? '; Secure' : ''}`);
    sendJson(response, 200, { authenticated: false });
    return;
  }
  if (url.searchParams.get('action') !== 'login') {
    sendJson(response, 404, { error: 'Route not found.' });
    return;
  }
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    sendJson(response, 503, { error: 'Admin access is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.' });
    return;
  }
  try {
    const body = await readJson(request);
    const suppliedUsername = Buffer.from(typeof body.username === 'string' ? body.username : '');
    const expectedUsername = Buffer.from(process.env.ADMIN_USERNAME || 'viis');
    const supplied = Buffer.from(typeof body.password === 'string' ? body.password : '');
    const expected = Buffer.from(process.env.ADMIN_PASSWORD);
    const validUsername = suppliedUsername.length === expectedUsername.length && crypto.timingSafeEqual(suppliedUsername, expectedUsername);
    const validPassword = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    const valid = validUsername && validPassword;
    if (!valid) {
      sendJson(response, 401, { error: 'The username or password is incorrect.' });
      return;
    }
    const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + SESSION_MS, nonce: crypto.randomUUID() })).toString('base64url');
    const token = `${payload}.${sign(payload)}`;
    response.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${isVercel() ? '; Secure' : ''}`);
    sendJson(response, 200, { authenticated: true, storageReady: !isVercel() || storageReady() });
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || 'Could not sign in.' });
  }
}

async function handleTeam(request, response) {
  if (request.method === 'GET') {
    try {
      sendJson(response, 200, { profiles: await loadProfiles() });
    } catch (error) {
      sendJson(response, 503, { error: error.message || 'Team profiles are unavailable.' });
    }
    return;
  }
  if (!['POST', 'PUT', 'DELETE'].includes(request.method)) {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response)) return;
  try {
    const url = requestUrl(request);
    const profiles = await loadProfiles();
    if (request.method === 'DELETE') {
      const index = profiles.findIndex((profile) => profile.id === url.searchParams.get('id'));
      if (index < 0) {
        sendJson(response, 404, { error: 'Team member not found.' });
        return;
      }
      const [removed] = profiles.splice(index, 1);
      await saveProfiles(profiles);
      if (removed.photoPath) await deletePhoto(removed.photoPath).catch(() => {});
      sendJson(response, 200, { profiles });
      return;
    }

    const body = await readJson(request);
    if (request.method === 'POST') {
      profiles.push(validateProfile(body));
    } else {
      const index = profiles.findIndex((profile) => profile.id === url.searchParams.get('id'));
      if (index < 0) {
        sendJson(response, 404, { error: 'Team member not found.' });
        return;
      }
      const oldPhoto = profiles[index].photoPath;
      profiles[index] = validateProfile(body, profiles[index]);
      await saveProfiles(profiles);
      if (oldPhoto && oldPhoto !== profiles[index].photoPath) await deletePhoto(oldPhoto).catch(() => {});
      sendJson(response, 200, { profiles });
      return;
    }
    await saveProfiles(profiles);
    sendJson(response, 201, { profiles });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'Could not save the team directory. Check Blob storage configuration.' });
  }
}

async function handleTeamPhoto(request, response) {
  const url = requestUrl(request);
  if (request.method === 'GET') {
    const pathname = url.searchParams.get('path') || '';
    if (!/^team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)
      && !/^team\/photos\/team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
      sendJson(response, 404, { error: 'Photo not found.' });
      return;
    }
    await servePhoto(request, response, pathname, LOCAL_PHOTO_DIR, 'Team photo');
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response)) return;
  const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
  const imageType = imageTypes[contentType];
  if (!imageType) {
    sendJson(response, 415, { error: 'Choose a JPEG, PNG, or WebP image.' });
    return;
  }
  try {
    const image = await readBody(request, MAX_PHOTO_BYTES);
    const signature = imageType.signature;
    const valid = image.length >= signature.length && signature.every((byte, index) => image[index] === byte);
    if (!valid || (contentType === 'image/webp' && image.toString('ascii', 8, 12) !== 'WEBP')) {
      sendJson(response, 400, { error: 'The file contents do not match the selected image type.' });
      return;
    }
    const fileName = `team-${crypto.randomUUID()}.${imageType.extension}`;
    if (!isVercel()) {
      await fs.mkdir(LOCAL_PHOTO_DIR, { recursive: true });
      await fs.writeFile(path.join(LOCAL_PHOTO_DIR, fileName), image);
      sendJson(response, 201, { url: `/api/team-photo?path=${encodeURIComponent(fileName)}`, path: fileName });
      return;
    }
    if (!storageReady()) {
      sendJson(response, 503, { error: 'Connect a Vercel Blob store before uploading photos.' });
      return;
    }
    const { put } = await getBlobSdk();
    const blob = await put(`team/photos/${fileName}`, image, {
      access: 'private',
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: 31536000,
    });
    sendJson(response, 201, {
      url: `/api/team-photo?path=${encodeURIComponent(blob.pathname)}`,
      path: blob.pathname,
    });
  } catch (error) {
    const message = String(error.message || 'Unknown error')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/(token\s*[=:]\s*)\S+/gi, '$1[redacted]');
    console.error('Team photo upload failed:', {
      name: error.name || 'Error',
      message,
      code: error.code,
      status: error.statusCode || error.status,
    });
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'Could not upload this photo.' });
  }
}

async function handleGalleryPhoto(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  const pathname = requestUrl(request).searchParams.get('path') || '';
  if (!/^gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)
    && !/^gallery\/photos\/gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
    sendJson(response, 404, { error: 'Photo not found.' });
    return;
  }
  await servePhoto(request, response, pathname, LOCAL_GALLERY_PHOTO_DIR, 'Gallery photo');
}

async function servePhoto(request, response, pathname, localDirectory, label) {
  if (isVercel()) {
    try {
      const { get } = await getBlobSdk();
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200) {
        sendJson(response, 404, { error: 'Photo not found.' });
        return;
      }
      const image = Buffer.from(await new Response(result.stream).arrayBuffer());
      response.writeHead(200, {
        'Content-Type': result.blob.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(image);
    } catch (error) {
      console.error(`${label} read failed:`, {
        name: error.name || 'Error',
        message: String(error.message || 'Unknown error')
          .replace(/Bearer\s+\S+/gi, '******')
          .replace(/(token\s*[=:]\s*)\S+/gi, '$1[redacted]'),
        code: error.code,
        status: error.statusCode || error.status,
      });
      sendJson(response, 500, { error: 'Photo not found.' });
    }
    return;
  }
  try {
    const image = await fs.readFile(path.join(localDirectory, path.basename(pathname)));
    const type = pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    response.end(image);
  } catch {
    sendJson(response, 404, { error: 'Photo not found.' });
  }
}

async function deletePhoto(pathname) {
  if (!isVercel()) {
    if (/^team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) await fs.unlink(path.join(LOCAL_PHOTO_DIR, pathname)).catch(() => {});
    return;
  }
  if (!pathname.startsWith('team/photos/')) return;
  const { del } = await getBlobSdk();
  await del(pathname, { access: 'private' });
}

async function deleteGalleryPhoto(pathname) {
  if (!/^gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)
    && !/^gallery\/photos\/gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) return;
  if (!isVercel()) {
    if (/^gallery-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
      await fs.unlink(path.join(LOCAL_GALLERY_PHOTO_DIR, pathname)).catch(() => {});
    }
    return;
  }
  if (!pathname.startsWith('gallery/photos/')) return;
  const { del } = await getBlobSdk();
  await del(pathname, { access: 'private' });
}

async function deleteArticlePhoto(pathname) {
  if (!/^article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)
    && !/^articles\/photos\/article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) return;
  if (!isVercel()) {
    if (/^article-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
      await fs.unlink(path.join(LOCAL_ARTICLE_PHOTO_DIR, pathname)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return;
  }
  if (!pathname.startsWith('articles/photos/')) return;
  const { del } = await getBlobSdk();
  await del(pathname, { access: 'private' });
}

module.exports = {
  handleAdmin,
  handleArticles,
  handleArticleImage,
  handleContent,
  handleGallery,
  handleGalleryPhoto,
  handleTeam,
  handleTeamPhoto,
  hasAdminSession,
  requireAdmin,
  requireSameOrigin,
};