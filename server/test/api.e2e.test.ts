import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { defaultConfig, type CalendarResponse } from '../../shared/contracts.js';
import { startMockServices } from './mock-services.js';

// The real server, started on its own port and data folder, talking to the
// mock Jellyfin, Sonarr and Radarr. It signs in through the app's own login
// endpoints, so what a profile receives is what the browser would receive.
let mocks: Awaited<ReturnType<typeof startMockServices>>;
let server: ChildProcess;
let dataDir = '';
let baseUrl = '';
let adminCookie = '';

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function call(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const text = await response.text();
  return { status: response.status, cookie, json: text ? JSON.parse(text) : null };
}

async function signInAs(userId: string): Promise<string> {
  const result = await call('/api/auth/profile-login', { method: 'POST', body: { userId, password: 'any-password' } });
  assert.equal(result.status, 200);
  return result.cookie;
}

async function calendarTitles(cookie: string): Promise<string[]> {
  const result = await call('/api/calendar?start=2026-11-01&end=2026-11-30', { cookie });
  assert.equal(result.status, 200);
  return (result.json as CalendarResponse).items.map((item) => item.title).sort();
}

before(async () => {
  mocks = await startMockServices();
  dataDir = await mkdtemp(join(tmpdir(), 'omniarr-e2e-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['dist-server/server/index.js'], {
    env: { ...process.env, PORT: String(port), OMNIARR_DATA_DIR: dataDir },
    stdio: 'ignore'
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await fetch(`${baseUrl}/api/health`).then((response) => response.ok).catch(() => false);
    if (ready) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // A throwaway master password for this throwaway data folder.
  const registered = await call('/api/auth/register', { method: 'POST', body: { password: randomUUID() } });
  assert.equal(registered.status, 200);
  adminCookie = registered.cookie;

  const saved = await call('/api/settings', {
    method: 'PUT',
    cookie: adminCookie,
    body: {
      ...defaultConfig,
      preferences: { ...defaultConfig.preferences, hiddenSections: { limited: ['downloads', 'anime'] } },
      jellyfin: { baseUrl: mocks.jellyfinUrl, apiKey: 'key', userId: '' },
      sonarr: { ...defaultConfig.sonarr, baseUrl: mocks.sonarrUrl, apiKey: 'key' },
      radarr: { ...defaultConfig.radarr, baseUrl: mocks.radarrUrl, apiKey: 'key' }
    }
  });
  assert.equal(saved.status, 200);
});

after(async () => {
  server?.kill();
  await mocks?.close();
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true });
  }
});

describe('upcoming calendar through the API', () => {
  it('gives the administrator every release', async () => {
    assert.deepEqual(await calendarTitles(adminCookie), ['Anime', 'Better Call Saul', 'Dune', 'Frieren', 'Your Name']);
  });

  it('gives a profile with every library every release', async () => {
    assert.deepEqual(await calendarTitles(await signInAs('full')), ['Anime', 'Better Call Saul', 'Dune', 'Frieren', 'Your Name']);
  });

  it('keeps releases of libraries a profile cannot open out of its calendar', async () => {
    assert.deepEqual(await calendarTitles(await signInAs('limited')), ['Anime', 'Better Call Saul', 'Dune']);
  });
});

describe('sections hidden for a profile', () => {
  it('closes the hidden sections for that profile only', async () => {
    const limited = await signInAs('limited');
    const full = await signInAs('full');
    assert.equal((await call('/api/downloads', { cookie: limited })).status, 403);
    assert.equal((await call('/api/hubs/anime', { cookie: limited })).status, 403);
    assert.notEqual((await call('/api/downloads', { cookie: full })).status, 403);
    assert.notEqual((await call('/api/downloads', { cookie: adminCookie })).status, 403);
  });

  it('lets only the administrator read the library access and change settings', async () => {
    const limited = await signInAs('limited');
    assert.equal((await call('/api/admin/profile-access', { cookie: limited })).status, 403);
    assert.equal((await call('/api/settings', { method: 'PUT', cookie: limited, body: defaultConfig })).status, 403);

    const access = await call('/api/admin/profile-access', { cookie: adminCookie });
    assert.equal(access.status, 200);
    assert.deepEqual(
      (access.json as { profiles: Array<{ userId: string; libraries: Array<{ name: string; access: boolean }> }> })
        .profiles.find((profile) => profile.userId === 'limited')?.libraries.filter((library) => library.access).map((library) => library.name),
      ['Shows', 'Movies']
    );
  });
});
