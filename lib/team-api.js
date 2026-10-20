const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const COOKIE_NAME = 'ecosynic_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 64_000;
const MAX_PHOTO_BYTES = 4_000_000;
const TEAM_FILE = 'team/profiles.json';
const LOCAL_DATA = path.join(__dirname, '..', '.data');
const LOCAL_TEAM_FILE = path.join(LOCAL_DATA, 'team.json');
const LOCAL_PHOTO_DIR = path.join(LOCAL_DATA, 'team-photos');
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

async function readJson(request) {
  const buffer = await readBody(request);
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
  const result = await get(TEAM_FILE, { access: 'public', useCache: false });
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
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60,
  });
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
    if (!/^team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
      sendJson(response, 404, { error: 'Photo not found.' });
      return;
    }
    try {
      const image = await fs.readFile(path.join(LOCAL_PHOTO_DIR, pathname));
      const type = pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      response.end(image);
    } catch {
      sendJson(response, 404, { error: 'Photo not found.' });
    }
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
      access: 'public',
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: 31536000,
    });
    sendJson(response, 201, { url: blob.url, path: blob.pathname });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.status ? error.message : 'Could not upload this photo.' });
  }
}

async function deletePhoto(pathname) {
  if (!isVercel()) {
    if (/^team-[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) await fs.unlink(path.join(LOCAL_PHOTO_DIR, pathname)).catch(() => {});
    return;
  }
  if (!pathname.startsWith('team/photos/')) return;
  const { del } = await getBlobSdk();
  await del(pathname, { access: 'public' });
}

module.exports = { handleAdmin, handleTeam, handleTeamPhoto, hasAdminSession, requireAdmin, requireSameOrigin };