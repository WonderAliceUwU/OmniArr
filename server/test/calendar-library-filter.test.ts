import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { defaultConfig, type AppConfig } from '../../shared/contracts.js';
import { getCalendar, getProfileLibraryAccess, isInFolders } from '../lib/services.js';
import { startMockServices } from './mock-services.js';

let mocks: Awaited<ReturnType<typeof startMockServices>>;

function configFor(userId: string): AppConfig {
  return {
    ...defaultConfig,
    jellyfin: { baseUrl: mocks.jellyfinUrl, apiKey: 'key', userId },
    sonarr: { ...defaultConfig.sonarr, baseUrl: mocks.sonarrUrl, apiKey: 'key' },
    radarr: { ...defaultConfig.radarr, baseUrl: mocks.radarrUrl, apiKey: 'key' }
  };
}

async function calendarTitles(config: AppConfig): Promise<string[]> {
  const calendar = await getCalendar(config, new Date('2026-11-01'), new Date('2026-11-30'));
  return calendar.items.map((item) => item.title).sort();
}

before(async () => {
  mocks = await startMockServices();
});

after(async () => {
  await mocks.close();
});

describe('upcoming calendar per profile', () => {
  it('shows everything to the administrator, who has no Jellyfin profile', async () => {
    assert.deepEqual(await calendarTitles(configFor('')), ['Anime', 'Better Call Saul', 'Dune', 'Frieren', 'Your Name']);
  });

  it('shows everything to a profile that opens every library', async () => {
    assert.deepEqual(await calendarTitles(configFor('full')), ['Anime', 'Better Call Saul', 'Dune', 'Frieren', 'Your Name']);
  });

  it('leaves out releases stored in libraries the profile cannot open', async () => {
    assert.deepEqual(await calendarTitles(configFor('limited')), ['Anime', 'Better Call Saul', 'Dune']);
  });

  it('does not calendar-filter when Jellyfin cannot be asked', async () => {
    const config = configFor('limited');
    config.jellyfin.baseUrl = 'http://127.0.0.1:9';
    assert.deepEqual(await calendarTitles(config), ['Anime', 'Better Call Saul', 'Dune', 'Frieren', 'Your Name']);
  });
});

describe('library folder matching', () => {
  it('matches a title by the library folder it is stored in', () => {
    assert.equal(isInFolders('/shared/Library/Anime/Frieren', ['anime']), true);
    assert.equal(isInFolders('/shared/library/ANIME/Frieren', ['anime']), true);
    assert.equal(isInFolders('/shared/Library/Shows/Frieren', ['anime']), false);
  });

  it('ignores the title\'s own folder and handles missing data', () => {
    assert.equal(isInFolders('/shared/Library/Shows/Anime', ['anime']), false);
    assert.equal(isInFolders(undefined, ['anime']), false);
    assert.equal(isInFolders('/shared/Library/Anime/Frieren', null), false);
    assert.equal(isInFolders('C:\\Media\\Anime\\Frieren', ['anime']), true);
  });
});

describe('profile library access', () => {
  it('reports which libraries each Jellyfin profile can open', async () => {
    const profiles = await getProfileLibraryAccess(configFor(''));
    const full = profiles.find((profile) => profile.userId === 'full');
    const limited = profiles.find((profile) => profile.userId === 'limited');
    assert.equal(full?.allLibraries, true);
    assert.ok(full?.libraries.every((library) => library.access));
    assert.equal(limited?.allLibraries, false);
    assert.deepEqual(
      limited?.libraries.filter((library) => library.access).map((library) => library.name),
      ['Shows', 'Movies']
    );
  });
});
