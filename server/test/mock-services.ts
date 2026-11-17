import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Stand-ins for Jellyfin, Sonarr and Radarr with two profiles: "full" opens
// every library and "limited" cannot open Anime or Anime Movies. Sonarr and
// Radarr see the media under /shared/Library while Jellyfin sees /library, the
// way the Docker mounts differ in a real setup.
export const MOCK_LIBRARIES = [
  { Name: 'Shows', ItemId: 'aaaaaaaa-0000-0000-0000-000000000001', Locations: ['/library/Shows'] },
  { Name: 'Movies', ItemId: 'aaaaaaaa-0000-0000-0000-000000000002', Locations: ['/library/Movies'] },
  { Name: 'Anime', ItemId: 'aaaaaaaa-0000-0000-0000-000000000003', Locations: ['/library/Anime'] },
  { Name: 'Anime Movies', ItemId: 'aaaaaaaa-0000-0000-0000-000000000004', Locations: ['/library/AnimeMovies'] }
];

export const MOCK_USERS = [
  { Id: 'full', Name: 'Full', Policy: { EnableAllFolders: true, EnabledFolders: [] } },
  {
    Id: 'limited',
    Name: 'Limited',
    Policy: { EnableAllFolders: false, EnabledFolders: [MOCK_LIBRARIES[0].ItemId, MOCK_LIBRARIES[1].ItemId] }
  }
];

const AIR_DATE = '2026-11-20T20:00:00Z';

const SONARR_CALENDAR = [
  { id: 1, title: 'Pilot', airDateUtc: AIR_DATE, seasonNumber: 1, episodeNumber: 1, series: { title: 'Better Call Saul', tmdbId: 60059, path: '/shared/Library/Shows/Better Call Saul' } },
  { id: 2, title: 'Chapter 1', airDateUtc: AIR_DATE, seasonNumber: 1, episodeNumber: 1, series: { title: 'Frieren', tmdbId: 209867, path: '/shared/Library/Anime/Frieren' } },
  // A series folder that happens to be called like a library is still a Shows title.
  { id: 3, title: 'Episode 1', airDateUtc: AIR_DATE, seasonNumber: 1, episodeNumber: 1, series: { title: 'Anime', tmdbId: 1, path: '/shared/Library/Shows/Anime' } }
];

const RADARR_CALENDAR = [
  { id: 10, title: 'Dune', tmdbId: 438631, digitalRelease: AIR_DATE, path: '/shared/Library/Movies/Dune' },
  { id: 11, title: 'Your Name', tmdbId: 372058, digitalRelease: AIR_DATE, path: '/shared/Library/AnimeMovies/Your Name' }
];

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
}

function jsonServer(handler: (path: string, query: URLSearchParams, body: string) => unknown): Server {
  return createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(handler(url.pathname, url.searchParams, Buffer.concat(chunks).toString('utf8'))));
    });
  });
}

export async function startMockServices() {
  const jellyfin = jsonServer((path, query, body) => {
    // Any password signs a profile in, so the app's own login can be exercised.
    if (path === '/Users/AuthenticateByName') {
      const username = (JSON.parse(body || '{}') as { Username?: string }).Username;
      return { User: { Id: MOCK_USERS.find((user) => user.Name === username)?.Id } };
    }
    if (path === '/Library/VirtualFolders') {
      return MOCK_LIBRARIES;
    }
    if (path === '/Users') {
      return MOCK_USERS;
    }
    if (path === '/UserViews') {
      const user = MOCK_USERS.find((candidate) => candidate.Id === query.get('userId'));
      const visible = MOCK_LIBRARIES.filter((library) => user?.Policy.EnableAllFolders || user?.Policy.EnabledFolders.includes(library.ItemId));
      return { Items: visible.map((library) => ({ Id: library.ItemId.replace(/-/g, ''), Name: library.Name })) };
    }
    return { Items: [] };
  });
  const sonarr = jsonServer(() => SONARR_CALENDAR);
  const radarr = jsonServer(() => RADARR_CALENDAR);
  const [jellyfinUrl, sonarrUrl, radarrUrl] = await Promise.all([listen(jellyfin), listen(sonarr), listen(radarr)]);

  return {
    jellyfinUrl,
    sonarrUrl,
    radarrUrl,
    close: () => Promise.all([jellyfin, sonarr, radarr].map((server) => new Promise((resolve) => server.close(resolve))))
  };
}

// `node dist-server/server/test/mock-services.js` keeps the mocks running so the
// app can be pointed at them (Jellyfin API key and Sonarr/Radarr keys: anything).
const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').slice(-3).join('/'));
if (isMain) {
  const mocks = await startMockServices();
  console.log(`Jellyfin ${mocks.jellyfinUrl}\nSonarr   ${mocks.sonarrUrl}\nRadarr   ${mocks.radarrUrl}`);
  console.log('Profiles: "full" opens every library, "limited" cannot open Anime or Anime Movies.');
}
