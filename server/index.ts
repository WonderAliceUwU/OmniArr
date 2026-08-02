import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  defaultConfig,
  type AppConfig,
  type AuthPayload,
  type EpisodeRequestPayload,
  type EpisodeWatchStateRequest,
  type SeasonDeletePayload,
  type SeasonRequestPayload,
  type TitleDetailsRequest
} from '../shared/contracts.js';
import { decryptJson, deriveEncryptionKey, encryptJson, randomToken, verifyPassword, createPasswordRecord } from './lib/security.js';
import { loadState, readAdmin, readEncryptedConfig, saveAdminAndConfig, updateEncryptedConfig } from './lib/store.js';
import {
  getCalendar,
  getConnectionStatuses,
  getDashboard,
  getDownloads,
  getHubPage,
  searchTitles,
  getTitleDetails,
  getTmdbLogos,
  deleteSeasonFiles,
  getServiceOptions,
  loadJellyfinUsers,
  proxyJellyfinImage,
  removeDownload,
  requestEpisode,
  requestMovie,
  requestSeason,
  requestSeries,
  setEpisodeWatchState,
  sanitizeConfig,
  getDownloadsResponse,
  dismissCompletedDownload,
  dismissAllCompletedDownloads
} from './lib/services.js';

interface SessionRecord {
  encryptionKey: Buffer;
  expiresAt: number;
}

const PORT = Number(process.env.PORT || 8787);
const SESSION_COOKIE = 'omniarr_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map<string, SessionRecord>();
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    console.error('Unhandled request error:', error);
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OmniArr server listening on http://127.0.0.1:${PORT}`);
});

setInterval(cleanupSessions, 1000 * 60 * 15).unref();

async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method || 'GET';
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  console.log(`${method} ${url.pathname}`);

  if (url.pathname === '/api/health' && method === 'GET') {
    sendJson(response, 200, {
      ok: true
    });
    return;
  }

  if (url.pathname === '/api/auth/session' && method === 'GET') {
    const state = await loadState();
    const session = getSession(request);
    sendJson(response, 200, {
      needsSetup: !state.admin,
      authenticated: Boolean(session)
    });
    return;
  }

  if (url.pathname === '/api/auth/register' && method === 'POST') {
    const state = await loadState();
    if (state.admin) {
      console.warn('Register blocked: app already initialized');
      sendJson(response, 409, { error: 'The app has already been initialized.' });
      return;
    }

    const body = await readJson<AuthPayload>(request);
    const password = String(body.password || '');
    if (password.length < 8) {
      console.warn('Register blocked: password too short');
      sendJson(response, 400, { error: 'Password must be at least 8 characters long.' });
      return;
    }

    const record = createPasswordRecord(password);
    const encryptionKey = deriveEncryptionKey(password, record.encryptionSalt);
    await saveAdminAndConfig(
      {
        ...record,
        createdAt: new Date().toISOString()
      },
      encryptJson(defaultConfig, encryptionKey)
    );

    const token = createSession(encryptionKey);
    setSessionCookie(request, response, token);
    resetFailedAttempts(getClientAddress(request));
    console.log('Register completed successfully');
    sendJson(response, 200, {
      ok: true,
      needsSetup: false
    });
    return;
  }

  if (url.pathname === '/api/auth/login' && method === 'POST') {
    const admin = await readAdmin();
    if (!admin) {
      console.warn('Login blocked: no master password configured');
      sendJson(response, 409, { error: 'The app does not have a master password yet.' });
      return;
    }

    if (isRateLimited(getClientAddress(request))) {
      console.warn('Login blocked: rate limited');
      sendJson(response, 429, { error: 'Too many attempts. Wait one minute.' });
      return;
    }

    const body = await readJson<AuthPayload>(request);
    const password = String(body.password || '');
    if (!verifyPassword(password, admin)) {
      trackFailedAttempt(getClientAddress(request));
      console.warn('Login blocked: incorrect password');
      sendJson(response, 401, { error: 'Incorrect password.' });
      return;
    }

    const encryptionKey = deriveEncryptionKey(password, admin.encryptionSalt);
    const token = createSession(encryptionKey);
    setSessionCookie(request, response, token);
    resetFailedAttempts(getClientAddress(request));
    console.log('Login completed successfully');
    sendJson(response, 200, {
      ok: true,
      needsSetup: false
    });
    return;
  }

  if (url.pathname === '/api/auth/logout' && method === 'POST') {
    const token = getSessionToken(request);
    if (token) {
      sessions.delete(token);
    }

    clearSessionCookie(request, response);
    sendJson(response, 200, { ok: true, needsSetup: false });
    return;
  }

  const session = getSession(request);
  if (!session && url.pathname.startsWith('/api/')) {
    sendJson(response, 401, { error: 'Unauthorized.' });
    return;
  }

  if (url.pathname === '/api/settings' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    sendJson(response, 200, config);
    return;
  }

  if (url.pathname === '/api/settings' && method === 'PUT') {
    const body = await readJson<AppConfig>(request);
    const config = sanitizeConfig(body);
    await updateEncryptedConfig(encryptJson(config, session!.encryptionKey));
    const connections = await getConnectionStatuses(config);
    sendJson(response, 200, {
      config,
      connections
    });
    return;
  }

  if (url.pathname === '/api/settings/options' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    sendJson(response, 200, await getServiceOptions(config));
    return;
  }

  if (url.pathname === '/api/settings/jellyfin-users' && method === 'POST') {
    const body = await readJson<{ baseUrl: string; apiKey: string }>(request);
    sendJson(response, 200, {
      jellyfinUsers: await loadJellyfinUsers(String(body.baseUrl || ''), String(body.apiKey || ''))
    });
    return;
  }

  if (url.pathname === '/api/dashboard' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    sendJson(response, 200, await getDashboard(config));
    return;
  }

  if (url.pathname.startsWith('/api/hubs/') && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    const page = decodeURIComponent(url.pathname.replace('/api/hubs/', ''));
    console.log(`[API] GET /api/hubs/${page}`);
    try {
      const result = await getHubPage(config, page as any);
      sendJson(response, 200, result);
    } catch (err) {
      console.error(`[API] Error in GET /api/hubs/${page}:`, err);
      sendJson(response, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
    }
    return;
  }

  if (url.pathname === '/api/downloads' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    sendJson(response, 200, await getDownloadsResponse(config));
    return;
  }

  if (url.pathname === '/api/calendar' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');

    let start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    let end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);

    if (startParam) {
        try {
            start = new Date(startParam);
        } catch (e) {
            // ignore invalid date
        }
    }

    if (endParam) {
        try {
            end = new Date(endParam);
        } catch (e) {
            // ignore invalid date
        }
    }

    sendJson(response, 200, await getCalendar(config, start, end));
    return;
  }

  if (url.pathname === '/api/search' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    const query = String(url.searchParams.get('query') || '');
    sendJson(response, 200, await searchTitles(config, query));
    return;
  }

  if (url.pathname === '/api/title-details' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<TitleDetailsRequest>(request);
    sendJson(response, 200, await getTitleDetails(config, body));
    return;
  }

  if (url.pathname === '/api/episodes/watch-state' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<EpisodeWatchStateRequest>(request);
    await setEpisodeWatchState(config, body);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/downloads/delete' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<{ id: string }>(request);
    await removeDownload(config, String(body.id || ''));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/downloads/dismiss' && method === 'POST') {
    const body = await readJson<{ id: string }>(request);
    dismissCompletedDownload(String(body.id || ''));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/downloads/dismiss-all' && method === 'POST') {
    dismissAllCompletedDownloads();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/requests/movie' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<{ tmdbId: number; user: string | null }>(request);
    await requestMovie(config, Number(body.tmdbId), body.user);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/requests/series' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<{ tmdbId: number; user: string | null }>(request);
    await requestSeries(config, Number(body.tmdbId), body.user);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/requests/season' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<SeasonRequestPayload & { user: string | null }>(request);
    await requestSeason(config, body, body.user);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/requests/episode' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<EpisodeRequestPayload & { user:string | null }>(request);
    await requestEpisode(config, body, body.user);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/seasons/delete' && method === 'POST') {
    const config = await readConfig(session!.encryptionKey);
    const body = await readJson<SeasonDeletePayload>(request);
    await deleteSeasonFiles(config, body);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname.startsWith('/api/assets/jellyfin/') && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    const itemId = decodeURIComponent(url.pathname.replace('/api/assets/jellyfin/', ''));
    const kind = url.searchParams.get('kind') || 'Primary';
    const maxWidth = Number(url.searchParams.get('maxWidth') || 640);
    const tag = url.searchParams.get('tag') || '';
    const image = await proxyJellyfinImage(config, itemId, kind, maxWidth, tag);
    if (!image) {
      response.writeHead(302, {
        Location: '/reiverr/placeholder.jpg',
        'Cache-Control': 'private, max-age=300'
      });
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': image.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=300'
    });
    response.end(Buffer.from(image.data));
    return;
  }

  if (url.pathname === '/api/tmdb/logo' && method === 'GET') {
    const config = await readConfig(session!.encryptionKey);
    const tmdbId = Number(url.searchParams.get('tmdbId') || 0);
    const mediaTypeParam = url.searchParams.get('mediaType');
    const mediaType = mediaTypeParam === 'tv' ? 'tv' : mediaTypeParam === 'movie' ? 'movie' : null;

    if (!tmdbId || !mediaType) {
      sendJson(response, 400, { error: 'tmdbId and mediaType are required.' });
      return;
    }

    const logos = await getTmdbLogos(config, tmdbId, mediaType);
    sendJson(response, 200, { logos });
    return;
  }

  await serveApp(url.pathname, response);
}

function createSession(encryptionKey: Buffer): string {
  const token = randomToken();
  sessions.set(token, {
    encryptionKey,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getSession(request: IncomingMessage): SessionRecord | null {
  const token = getSessionToken(request);
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function getSessionToken(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === SESSION_COOKIE && value) {
      return value;
    }
  }

  return null;
}

function setSessionCookie(request: IncomingMessage, response: ServerResponse, token: string): void {
  const isSecure = request.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${isSecure ? '; Secure' : ''}`
  );
}

function clearSessionCookie(request: IncomingMessage, response: ServerResponse): void {
  const isSecure = request.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${isSecure ? '; Secure' : ''}`
  );
}

async function readConfig(encryptionKey: Buffer): Promise<AppConfig> {
  const encrypted = await readEncryptedConfig();
  if (!encrypted) {
    return defaultConfig;
  }

  const stored = decryptJson<Partial<AppConfig>>(encrypted, encryptionKey);

  return sanitizeConfig({
    preferences: {
      ...defaultConfig.preferences,
      ...(stored.preferences || {})
    },
    jellyfin: {
      ...defaultConfig.jellyfin,
      ...(stored.jellyfin || {})
    },
    sonarr: {
      ...defaultConfig.sonarr,
      ...(stored.sonarr || {})
    },
    radarr: {
      ...defaultConfig.radarr,
      ...(stored.radarr || {})
    },
    tmdb: {
      ...defaultConfig.tmdb,
      ...(stored.tmdb || {})
    },
    tvdb: {
      ...defaultConfig.tvdb,
      ...(stored.tvdb || {})
    }
  });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function serveApp(pathname: string, response: ServerResponse): Promise<void> {
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(process.cwd(), 'dist', `.${relativePath}`);

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentType(filePath)
    });
    response.end(content);
  } catch {
    try {
      const indexHtml = await readFile(resolve(process.cwd(), 'dist', 'index.html'));
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      response.end(indexHtml);
    } catch {
      response.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end('Build the frontend first with `npm run build`.');
    }
  }
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (filePath.endsWith('.png')) {
    return 'image/png';
  }
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  return 'application/octet-stream';
}

function getClientAddress(request: IncomingMessage): string {
  return request.socket.remoteAddress || 'unknown';
}

function trackFailedAttempt(address: string): void {
  const current = failedAttempts.get(address);
  failedAttempts.set(address, {
    count: (current?.count || 0) + 1,
    lastAttempt: Date.now()
  });
}

function resetFailedAttempts(address: string): void {
  failedAttempts.delete(address);
}

function isRateLimited(address: string): boolean {
  const current = failedAttempts.get(address);
  if (!current) {
    return false;
  }

  if (Date.now() - current.lastAttempt > 60_000) {
    failedAttempts.delete(address);
    return false;
  }

  return current.count >= 5;
}

function cleanupSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(token);
    }
  }
}
