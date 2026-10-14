const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { GoogleGenAI } = require('@google/genai');
const nodemailer = require('nodemailer');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const GEMINI_MODEL = 'gemini-3.8-flash';
const MAX_BODY_BYTES = 16_000;
const CACHE_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const rateLimits = new Map();
const forecastCache = new Map();

const regions = {
  meru: { name: 'Meru, Kenya', latitude: -0.047, longitude: 37.65 },
  nairobi: { name: 'Nairobi, Kenya', latitude: -1.286, longitude: 36.817 },
  kisumu: { name: 'Kisumu, Kenya', latitude: -0.102, longitude: 34.761 },
  eldoret: { name: 'Eldoret, Kenya', latitude: 0.514, longitude: 35.269 },
  arusha: { name: 'Arusha, Tanzania', latitude: -3.387, longitude: 36.682 },
  kampala: { name: 'Kampala, Uganda', latitude: 0.348, longitude: 32.583 },
  lagos: { name: 'Lagos, Nigeria', latitude: 6.524, longitude: 3.379 },
  london: { name: 'London, UK', latitude: 51.5074, longitude: -0.1278 },
  'new-york': { name: 'New York, USA', latitude: 40.7128, longitude: -74.006 },
};

const publicFiles = new Set([
  'index.html',
  'staff.html',
  'climate-resilience.html',
  'ecosystem-restoration.html',
  'smart-agriculture.html',
  'climate-technology.html',
  'green-livelihoods.html',
  'community-leadership.html',
  'styles.css',
  'script.js',
]);

function loadLocalEnvironment() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
    process.env[match[1]] = value;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  response.end(JSON.stringify(body));
}

function allowRequest(request, response, limit) {
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) {
        sendJson(response, 403, { error: 'Cross-origin requests are not allowed.' });
        return false;
      }
    } catch {
      sendJson(response, 403, { error: 'Invalid request origin.' });
      return false;
    }
  }

  const now = Date.now();
  const address = request.socket.remoteAddress || 'local';
  const key = `${address}:${request.url.split('?')[0]}`;
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else if (current.count >= limit) {
    sendJson(response, 429, { error: 'Too many requests. Please try again in a few minutes.' });
    return false;
  } else {
    current.count += 1;
  }

  for (const [entry, value] of rateLimits) {
    if (value.resetAt <= now) rateLimits.delete(entry);
  }
  return true;
}

async function readJson(request) {
  if (request.body !== undefined) {
    if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
    const body = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : String(request.body);
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    try {
      return JSON.parse(body);
    } catch {
      const error = new Error('Request body must be valid JSON.');
      error.status = 400;
      throw error;
    }
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

async function getForecast(regionId) {
  const region = regions[regionId];
  if (!region) {
    const error = new Error('Choose a supported region.');
    error.status = 400;
    throw error;
  }

  const cached = forecastCache.get(regionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.data;

  const params = new URLSearchParams({
    latitude: String(region.latitude),
    longitude: String(region.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    forecast_days: '7',
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
  const data = await response.json();
  if (!data.current || !data.daily?.time) throw new Error('Weather service returned incomplete forecast data.');

  const forecast = {
    region: region.name,
      aiAvailable: Boolean(process.env.GEMINI_API_KEY),
    timezone: data.timezone,
    fetchedAt: new Date().toISOString(),
    current: {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
      time: data.current.time,
    },
    daily: data.daily.time.map((date, index) => ({
      date,
      weatherCode: data.daily.weather_code?.[index] ?? null,
      high: data.daily.temperature_2m_max?.[index] ?? null,
      low: data.daily.temperature_2m_min?.[index] ?? null,
      precipitation: data.daily.precipitation_sum?.[index] ?? null,
      precipitationProbability: data.daily.precipitation_probability_max?.[index] ?? null,
    })),
  };
  forecastCache.set(regionId, { fetchedAt: Date.now(), data: forecast });
  return forecast;
}

function weatherSummary(forecast) {
  const daily = forecast.daily.map((day) => `${day.date}: ${day.low}–${day.high} °C, ${day.precipitation} mm rain, ${day.precipitationProbability ?? 'unknown'}% precipitation probability`).join('\n');
  return `Location: ${forecast.region}\nCurrent conditions: ${forecast.current.temperature} °C, feels like ${forecast.current.feelsLike} °C, humidity ${forecast.current.humidity}%, precipitation ${forecast.current.precipitation} mm, wind ${forecast.current.windSpeed} km/h.\nSeven-day forecast:\n${daily}`;
}

async function getAdvice(request, response) {
  if (!allowRequest(request, response, 12)) return;
  const body = await readJson(request);
  const region = regions[body.regionId];
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1600) : '';
  if (!region || !question) {
    sendJson(response, 400, { error: 'Choose a region and enter a climate question.' });
    return;
  }

  const forecast = await getForecast(body.regionId);
  if (!process.env.GEMINI_API_KEY) {
    const totalRain = forecast.daily.reduce((sum, day) => sum + (day.precipitation || 0), 0);
    const warmestDay = forecast.daily.reduce((warmest, day) => day.high > warmest.high ? day : warmest, forecast.daily[0]);
    const wetterDays = forecast.daily.filter((day) => (day.precipitation || 0) >= 5 || (day.precipitationProbability || 0) >= 60);
    const advice = [
      `For ${forecast.region}, the live seven-day outlook totals about ${totalRain.toFixed(1)} mm of rain, with temperatures reaching ${Math.round(warmestDay.high)}°C.`,
      wetterDays.length
        ? `Rain is more likely around ${wetterDays.map((day) => new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: forecast.timezone }).format(new Date(`${day.date}T12:00:00`))).join(', ')}. Check local field conditions before planting or applying inputs, and avoid working saturated soil.`
        : 'The forecast shows limited rainfall during this period. Check soil moisture before planting, and plan irrigation or water conservation where available.',
      'This is a weather-based planning prompt, not a seasonal climate prediction. Confirm local forecasts and ask an agricultural extension officer about crop- and soil-specific decisions.',
      'For conversational, question-specific AI responses, configure GEMINI_API_KEY on the server.'
    ].join('\n\n');
    sendJson(response, 200, { reply: advice, forecast, source: 'forecast' });
    return;
  }

  const history = Array.isArray(body.history) ? body.history.slice(-8).flatMap((message) => {
    if (!message || !['user', 'model'].includes(message.role) || typeof message.text !== 'string') return [];
    const speaker = message.role === 'user' ? 'Farmer' : 'Advisor';
    return [`${speaker}: ${message.text.slice(0, 1600)}`];
  }) : [];
  const latestQuestion = `Use this current weather context as a source of evidence, not as a guarantee:\n${weatherSummary(forecast)}\n\nFarmer's question: ${question}`;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const startedAt = Date.now();
  console.log('Gemini Interactions request started.');
  const interaction = await ai.interactions.create({
    model: GEMINI_MODEL,
    input: [...history, latestQuestion].join('\n\n'),
    system_instruction: 'You are Ecosynic Africa’s climate and agricultural advice assistant. Give clear, practical, locally relevant advice in plain language. Use the supplied seven-day weather forecast, state uncertainty, distinguish a weather forecast from a long-term climate projection, and never invent live data. Ask one short follow-up if location, crop, growth stage, or timing is essential. Avoid guarantees about yields or safety. Encourage users to follow official local weather alerts and consult local agricultural extension experts for high-risk decisions. Use short bullets when useful.',
    generation_config: { temperature: 0.35, max_output_tokens: 700, thinking_level: 'low' },
    store: false,
  }, {
    timeout_ms: 30_000,
    retries: {
      strategy: 'attempt-count-backoff',
      maxRetries: 1,
      backoff: {
        initialInterval: 500,
        maxInterval: 1_000,
        exponent: 2,
        maxElapsedTime: 1_500,
      },
      retryConnectionErrors: true,
    },
  });
  console.log(`Gemini Interactions request completed in ${Date.now() - startedAt}ms.`);
  const reply = interaction.output_text?.trim();
  if (!reply) throw new Error('The AI service returned an empty answer.');
  sendJson(response, 200, { reply, forecast, source: 'gemini' });
}

async function sendInquiry(request, response) {
  if (!allowRequest(request, response, 4)) return;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (!smtpHost || !smtpUser || !smtpPassword) {
    sendJson(response, 503, { error: 'Email is not configured yet. Please contact us by email or phone.' });
    return;
  }

  const body = await readJson(request);
  const inquiryTypes = new Set([
    'Partner with Ecosynic',
    'Fund a program',
    'Collaborate on research',
    'Explore an AI / technology partnership',
    'Collaborate on agriculture',
    'Work with communities',
    'Media enquiry',
    'General enquiry',
  ]);
  const inquiry = typeof body.inquiry === 'string' ? body.inquiry.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!inquiryTypes.has(inquiry) || !name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !message || message.length > 5000) {
    sendJson(response, 400, { error: 'Please check the enquiry type, name, email address, and provide a message of 5000 characters or fewer.' });
    return;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporter.sendMail({
      from: { name: `${name} via Ecosynic`, address: process.env.MAIL_FROM || smtpUser },
      to: process.env.MAIL_TO || 'info@ecosynic.or.ke',
      replyTo: email,
      subject: `${inquiry} | Website enquiry`,
      text: `Name: ${name}\nEmail: ${email}\nEnquiry: ${inquiry}\n\n${message}`,
    });
    sendJson(response, 200, { message: 'Your enquiry has been sent. Thank you for getting in touch.' });
  } catch (error) {
    console.error(`SMTP contact delivery failed (${error.code || error.name || 'Error'}).`);
    sendJson(response, 502, { error: 'We could not send your enquiry right now. Please try again later or email info@ecosynic.or.ke.' });
  }
}

async function handleContact(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  try {
    await sendInquiry(request, response);
  } catch (error) {
    const status = Number(error.status);
    sendJson(response, Number.isInteger(status) && status >= 400 && status < 600 ? status : 500, {
      error: error.status ? error.message : 'The server could not send your enquiry. Please try again later.',
    });
  }
}

async function handleForecast(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!allowRequest(request, response, 45)) return;
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const forecast = await getForecast(url.searchParams.get('region'));
    sendJson(response, 200, forecast);
  } catch (error) {
    sendJson(response, error.status || 502, { error: error.message || 'Could not load the weather forecast.' });
  }
}

async function handleAdvice(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  try {
    await getAdvice(request, response);
  } catch (error) {
    const details = String(error.message || 'No error details').replace(process.env.GEMINI_API_KEY || '\u0000', '[redacted]').slice(0, 300);
    console.error(`Gemini advice request failed (${error.name || 'Error'}, ${error.status || 'no status'}): ${details}`);
    const status = Number(error.status);
    const rateLimited = status === 429;
    const unavailable = status === 503 || /timeout|connection/i.test(error.name || '');
    const message = rateLimited
      ? 'Gemini has reached an API rate limit or quota. Check the key’s usage limits and try again later.'
      : unavailable
        ? 'Gemini is temporarily unavailable. Please try again shortly.'
        : error.message || 'Could not generate climate advice.';
    sendJson(response, Number.isInteger(status) && status >= 400 && status < 600 ? status : 502, { error: message });
  }
}

function serveStatic(url, response) {
  let requested;
  try {
    requested = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  } catch {
    sendJson(response, 400, { error: 'Invalid URL path.' });
    return;
  }
  if (!publicFiles.has(requested)) {
    sendJson(response, 404, { error: 'Page not found.' });
    return;
  }

  const filePath = path.join(ROOT, requested);
  const contentType = requested.endsWith('.html') ? 'text/html; charset=utf-8' : requested.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
  response.writeHead(200, {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  fs.createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/contact') {
    await handleContact(request, response);
    return;
  }
  if (url.pathname === '/api/forecast') {
    await handleForecast(request, response);
    return;
  }
  if (url.pathname === '/api/advice') {
    await handleAdvice(request, response);
    return;
  }
  if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    serveStatic(url, response);
    return;
  }
  sendJson(response, 404, { error: 'Route not found.' });
}

module.exports = { handleAdvice, handleContact, handleForecast };

if (require.main === module) {
  loadLocalEnvironment();
  http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (!response.headersSent) sendJson(response, 500, { error: 'The server could not complete this request.' });
      else response.destroy(error);
    });
  }).listen(PORT, () => {
    console.log(`Ecosynic Africa is running at http://localhost:${PORT}`);
    console.log(process.env.GEMINI_API_KEY ? 'Gemini climate advice is enabled.' : 'Forecasts are available; set GEMINI_API_KEY in .env to enable AI chat.');
  });
}