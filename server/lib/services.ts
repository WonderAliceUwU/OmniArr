import type {
  AppConfig,
  ConnectionStatus,
  DashboardResponse,
  DownloadItem,
  HubPageResponse,
  HubSection,
  MediaCard,
  SelectOption,
  ServiceOptionsResponse
} from '../../shared/contracts.js';

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

interface JellyfinItem {
  Id?: string;
  Name?: string;
  Type?: string;
  Overview?: string;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ProviderIds?: Record<string, string>;
  RunTimeTicks?: number;
  ProductionYear?: number;
  UserData?: {
    PlayedPercentage?: number;
    PlaybackPositionTicks?: number;
    Played?: boolean;
    UnplayedItemCount?: number;
  };
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  DateCreated?: string;
  DateLastMediaAdded?: string;
}

interface SonarrQueueRecord {
  id?: number;
  title?: string;
  series?: { title?: string };
  trackedDownloadState?: string;
  sizeleft?: number;
  size?: number;
  status?: string;
  timeleft?: string;
}

interface RadarrQueueRecord {
  id?: number;
  title?: string;
  movie?: { title?: string };
  trackedDownloadState?: string;
  sizeleft?: number;
  size?: number;
  status?: string;
  timeleft?: string;
}

interface QbitTorrent {
  hash?: string;
  name?: string;
  progress?: number;
  dlspeed?: number;
  size?: number;
  eta?: number;
  state?: string;
}

const ANIME_PROVIDERS = '337|8|9|430|283';
const DORAMA_PROVIDERS = '344|337|8|9|464';
const GENRE_ASSETS: Array<{ id: number; title: string; posterUrl: string }> = [
  { id: 28, title: 'Action', posterUrl: '/omniarr/genres/action.jpg' },
  { id: 12, title: 'Adventure', posterUrl: '/omniarr/genres/adventure.jpg' },
  { id: 16, title: 'Animation', posterUrl: '/omniarr/genres/animation.jpg' },
  { id: 35, title: 'Comedy', posterUrl: '/omniarr/genres/comedy.jpg' },
  { id: 80, title: 'Crime', posterUrl: '/omniarr/genres/crime.jpg' }
];
const NETWORK_ASSETS: Array<{ id: number; title: string; posterUrl: string }> = [
  { id: 213, title: 'Netflix', posterUrl: '/omniarr/networks/netflix.svg' },
  { id: 2739, title: 'Disney+', posterUrl: '/omniarr/networks/disney.svg' },
  { id: 49, title: 'HBO', posterUrl: '/omniarr/networks/hbo.svg' },
  { id: 453, title: 'Hulu', posterUrl: '/omniarr/networks/hulu.svg' },
  { id: 1024, title: 'Prime Video', posterUrl: '/omniarr/networks/amazon.svg' },
  { id: 2552, title: 'Apple TV+', posterUrl: '/omniarr/networks/apple.svg' }
];

export function sanitizeConfig(input: AppConfig): AppConfig {
  return {
    preferences: {
      language: input.preferences.language.trim() || 'en-US',
      region: input.preferences.region.trim().toUpperCase(),
      excludeLibraryItems: Boolean(input.preferences.excludeLibraryItems),
      animationLevel: input.preferences.animationLevel === 'reduced' ? 'reduced' : 'smooth'
    },
    jellyfin: {
      baseUrl: normalizeBaseUrl(input.jellyfin.baseUrl),
      apiKey: input.jellyfin.apiKey.trim(),
      userId: input.jellyfin.userId.trim()
    },
    sonarr: {
      baseUrl: normalizeBaseUrl(input.sonarr.baseUrl),
      apiKey: input.sonarr.apiKey.trim(),
      rootFolderPath: input.sonarr.rootFolderPath.trim(),
      qualityProfileId: Number(input.sonarr.qualityProfileId) || 0,
      languageProfileId: Number(input.sonarr.languageProfileId) || 0,
      monitor: input.sonarr.monitor.trim() || 'all',
      startSearch: Boolean(input.sonarr.startSearch)
    },
    radarr: {
      baseUrl: normalizeBaseUrl(input.radarr.baseUrl),
      apiKey: input.radarr.apiKey.trim(),
      rootFolderPath: input.radarr.rootFolderPath.trim(),
      qualityProfileId: Number(input.radarr.qualityProfileId) || 0,
      monitor: input.radarr.monitor.trim() || 'movieOnly',
      startSearch: Boolean(input.radarr.startSearch)
    },
    qbittorrent: {
      baseUrl: normalizeBaseUrl(input.qbittorrent.baseUrl),
      username: input.qbittorrent.username.trim(),
      password: input.qbittorrent.password.trim()
    },
    tmdb: {
      bearerToken: input.tmdb.bearerToken.trim()
    }
  };
}

export async function getConnectionStatuses(config: AppConfig): Promise<ConnectionStatus[]> {
  const [jellyfin, sonarr, radarr, qbittorrent, tmdb] = await Promise.all([
    testJellyfin(config),
    testSonarr(config),
    testRadarr(config),
    testQbittorrent(config),
    testTmdb(config)
  ]);

  return [jellyfin, sonarr, radarr, qbittorrent, tmdb];
}

export async function getServiceOptions(config: AppConfig): Promise<ServiceOptionsResponse> {
  const [
    jellyfinUsers,
    sonarrRootFolders,
    sonarrQualityProfiles,
    sonarrLanguageProfiles,
    radarrRootFolders,
    radarrQualityProfiles
  ] = await Promise.all([
    getJellyfinUsers(config),
    getSonarrRootFolders(config),
    getSonarrQualityProfiles(config),
    getSonarrLanguageProfiles(config),
    getRadarrRootFolders(config),
    getRadarrQualityProfiles(config)
  ]);

  return {
    jellyfinUsers,
    sonarrRootFolders,
    sonarrQualityProfiles,
    sonarrLanguageProfiles,
    radarrRootFolders,
    radarrQualityProfiles
  };
}

export async function loadJellyfinUsers(baseUrl: string, apiKey: string): Promise<SelectOption[]> {
  if (!baseUrl.trim() || !apiKey.trim()) {
    return [];
  }

  return getJellyfinUsersFromConfig(normalizeBaseUrl(baseUrl), apiKey.trim());
}

export async function getDashboard(config: AppConfig): Promise<DashboardResponse> {
  const [connections, library, downloads, tmdb] = await Promise.all([
    getConnectionStatuses(config),
    getLibrarySnapshot(config),
    getDownloads(config),
    getTmdbSnapshot(config)
  ]);

  const libraryTmdbIds = new Set<number>();
  for (const item of library.allItems) {
    const value = Number(item.ProviderIds?.Tmdb);
    if (value) {
      libraryTmdbIds.add(value);
    }
  }

  const filteredRecommendations = config.preferences.excludeLibraryItems
    ? tmdb.recommendations.filter((item) => !item.tmdbId || !libraryTmdbIds.has(item.tmdbId))
    : tmdb.recommendations;

  const filteredTrendingSeries = config.preferences.excludeLibraryItems
    ? tmdb.trendingSeries.filter((item) => !item.tmdbId || !libraryTmdbIds.has(item.tmdbId))
    : tmdb.trendingSeries;

  return {
    connections,
    hero: [...library.continueWatching, ...tmdb.hero].slice(0, 3),
    continueWatching: library.continueWatching,
    recentlyAdded: library.recentlyAdded,
    recommendations: filteredRecommendations.slice(0, 12),
    trendingSeries: filteredTrendingSeries.slice(0, 12),
    downloads
  };
}

export async function getHubPage(
  config: AppConfig,
  page: HubPageResponse['page']
): Promise<HubPageResponse> {
  const [library, downloads] = await Promise.all([
    getLibrarySnapshot(config),
    getDownloads(config)
  ]);

  const allSections = await buildHubSections(config, library, page);

  return {
    page,
    hero: allSections.hero,
    continueWatching: library.continueWatching,
    sections: allSections.sections.concat(
      page === 'library' && downloads.length
        ? [{
            id: 'downloads',
            title: 'Downloading',
            style: 'episode',
            items: downloads.map(downloadToCard)
          }]
        : []
    )
  };
}

export async function getDownloads(config: AppConfig): Promise<DownloadItem[]> {
  const [sonarrResult, radarrResult, qbitResult] = await Promise.allSettled([
    getSonarrQueue(config),
    getRadarrQueue(config),
    getQbitQueue(config)
  ]);

  const sonarr = sonarrResult.status === 'fulfilled' ? sonarrResult.value : [];
  const radarr = radarrResult.status === 'fulfilled' ? radarrResult.value : [];
  const qbit = qbitResult.status === 'fulfilled' ? qbitResult.value : [];

  return [
    ...sonarr.map(
      (item): DownloadItem => ({
        id: `sonarr-${item.id ?? Math.random()}`,
        source: 'sonarr',
        title: item.series?.title || item.title || 'Series',
        detail: item.title || 'Downloading episode',
        progress: getQueueProgress(item.size, item.sizeleft),
        state: item.status || item.trackedDownloadState || 'queue',
        eta: item.timeleft || '',
        size: item.size ? formatBytes(item.size) : ''
      })
    ),
    ...radarr.map(
      (item): DownloadItem => ({
        id: `radarr-${item.id ?? Math.random()}`,
        source: 'radarr',
        title: item.movie?.title || item.title || 'Movie',
        detail: item.title || 'Downloading movie',
        progress: getQueueProgress(item.size, item.sizeleft),
        state: item.status || item.trackedDownloadState || 'queue',
        eta: item.timeleft || '',
        size: item.size ? formatBytes(item.size) : ''
      })
    ),
    ...qbit.map(
      (item): DownloadItem => ({
        id: `qbit-${item.hash || Math.random()}`,
        source: 'qbittorrent',
        title: item.name || 'Torrent',
        detail: item.state || 'downloading',
        progress: Math.round((item.progress || 0) * 100),
        state: item.state || 'downloading',
        eta: typeof item.eta === 'number' && item.eta > 0 ? formatEta(item.eta) : '',
        speed: item.dlspeed ? `${formatBytes(item.dlspeed)}/s` : '',
        size: item.size ? formatBytes(item.size) : ''
      })
    )
  ].sort((a, b) => b.progress - a.progress);
}

export async function requestMovie(config: AppConfig, tmdbId: number): Promise<void> {
  const details = await tmdbFetch(config, `/movie/${tmdbId}?language=${encodeURIComponent(config.preferences.language)}`);
  if (!details) {
    throw new Error('Failed to load the movie from TMDb.');
  }

  await fetchJson(`${config.radarr.baseUrl}/api/v3/movie`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.radarr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: details.title || details.original_title || 'Movie',
      qualityProfileId: config.radarr.qualityProfileId,
      rootFolderPath: config.radarr.rootFolderPath,
      tmdbId: details.id,
      year: Number(String(details.release_date || '').slice(0, 4)) || 0,
      minimumAvailability: 'released',
      addOptions: {
        monitored: config.radarr.monitor !== 'none',
        searchForMovie: config.radarr.startSearch
      }
    })
  });
}

export async function requestSeries(config: AppConfig, tmdbId: number): Promise<void> {
  const details = await tmdbFetch(
    config,
    `/tv/${tmdbId}?append_to_response=external_ids&language=${encodeURIComponent(config.preferences.language)}`
  );
  if (!details) {
    throw new Error('Failed to load the series from TMDb.');
  }
  const externalIds = asRecord(details?.external_ids);
  const tvdbId = Number(externalIds.tvdb_id || 0);
  if (!tvdbId) {
    throw new Error('This series does not have a TVDB ID for Sonarr.');
  }

  await fetchJson(`${config.sonarr.baseUrl}/api/v3/series`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.sonarr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: details.name || details.original_name || 'Series',
      tvdbId,
      qualityProfileId: config.sonarr.qualityProfileId,
      languageProfileId: config.sonarr.languageProfileId,
      rootFolderPath: config.sonarr.rootFolderPath,
      seasonFolder: true,
      monitored: config.sonarr.monitor !== 'none',
      addOptions: {
        monitor: config.sonarr.monitor,
        searchForMissingEpisodes: config.sonarr.startSearch,
        searchForCutoffUnmetEpisodes: config.sonarr.startSearch
      }
    })
  });
}

export async function proxyJellyfinImage(
  config: AppConfig,
  itemId: string,
  kind: string,
  maxWidth: number,
  tag: string
): Promise<{ data: ArrayBuffer; contentType: string | null } | null> {
  const candidates = kind === 'Primary' ? ['Primary'] : [kind, 'Primary'];

  for (const candidate of candidates) {
    const path = `/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(candidate)}?quality=90&maxWidth=${maxWidth}&tag=${encodeURIComponent(tag)}`;
    const response = await fetch(`${config.jellyfin.baseUrl}${path}`, {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      }
    });

    if (!response.ok) {
      continue;
    }

    return {
      data: await response.arrayBuffer(),
      contentType: response.headers.get('content-type')
    };
  }

  return null;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${trimmed}`);
  }

  return parsed.toString().replace(/\/$/, '');
}

async function getLibrarySnapshot(config: AppConfig): Promise<{
  continueWatching: MediaCard[];
  recentlyAdded: MediaCard[];
  allItems: JellyfinItem[];
}> {
  if (!config.jellyfin.baseUrl || !config.jellyfin.apiKey || !config.jellyfin.userId) {
    return {
      continueWatching: [],
      recentlyAdded: [],
      allItems: []
    };
  }

  let resume!: JellyfinItem[];
  let nextUp!: JellyfinItem[];
  let allItems!: JellyfinItem[];

  try {
    [resume, nextUp, allItems] = await Promise.all([
      jellyfinFetch<JellyfinItem[]>(config, `/Users/${config.jellyfin.userId}/Items/Resume?mediaTypes=Video&fields=ProviderIds,Overview`),
      jellyfinFetch<JellyfinItem[]>(config, `/Shows/NextUp?userId=${config.jellyfin.userId}&fields=ProviderIds,Overview`),
      jellyfinFetch<JellyfinItem[]>(
        config,
        `/Users/${config.jellyfin.userId}/Items?recursive=true&includeItemTypes=Movie,Series&hasTmdbId=true&fields=ProviderIds,DateCreated,DateLastMediaAdded,Overview`
      )
    ]);
  } catch {
    return {
      continueWatching: [],
      recentlyAdded: [],
      allItems: []
    };
  }

  const continueWatching = [...resume, ...nextUp]
    .slice(0, 12)
    .map((item) => jellyfinToCard(item, item.SeriesName || item.Name || 'Continue watching'))
    .filter(Boolean) as MediaCard[];

  const recentlyAdded = [...allItems]
    .sort((a, b) => {
      const aDate = new Date(a.DateLastMediaAdded || a.DateCreated || 0).getTime();
      const bDate = new Date(b.DateLastMediaAdded || b.DateCreated || 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 12)
    .map((item) => jellyfinToCard(item, item.Name || 'Added recently'))
    .filter(Boolean) as MediaCard[];

  return {
    continueWatching,
    recentlyAdded,
    allItems
  };
}

async function buildHubSections(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>,
  page: HubPageResponse['page']
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  switch (page) {
    case 'stream':
      return buildStreamHub(config, library);
    case 'home':
      return buildHomeHub(config, library);
    case 'anime':
      return buildAnimeHub(config, library);
    case 'dorama':
      return buildDoramaHub(config, library);
    case 'library':
      return buildLibraryHub(config, library);
  }
}

async function buildStreamHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const tmdb = await getTmdbSnapshot(config);

  return {
    hero: [...library.continueWatching, ...tmdb.hero].slice(0, 6),
    sections: [
      {
        id: 'continue',
        title: 'Continue Watching',
        style: 'landscape',
        items: library.continueWatching
      },
      {
        id: 'recommendations',
        title: 'Recommendations',
        style: 'landscape',
        items: tmdb.recommendations
      },
      {
        id: 'trending-series',
        title: 'Trending Series',
        style: 'landscape',
        items: tmdb.trendingSeries
      }
    ]
  };
}

async function buildHomeHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const [
    trending,
    popularPeople,
    upcomingMovies,
    upcomingSeries,
    digitalReleases,
    streamingNow
  ] = await Promise.all([
    tmdbResultCards(config, `/trending/all/day?language=${encodeURIComponent(config.preferences.language)}`, 'landscape'),
    tmdbPeopleCards(config, `/trending/person/week?language=${encodeURIComponent(config.preferences.language)}`),
    tmdbResultCards(
      config,
      `/discover/movie?primary_release_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}&region=${encodeURIComponent(config.preferences.region)}`,
      'landscape'
    ),
    tmdbResultCards(
      config,
      `/discover/tv?first_air_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}`,
      'landscape'
    ),
    tmdbResultCards(
      config,
      `/discover/movie?with_release_type=4&sort_by=popularity.desc&release_date.lte=${todayIso()}&language=${encodeURIComponent(config.preferences.language)}`,
      'landscape'
    ),
    tmdbResultCards(
      config,
      `/discover/tv?air_date.gte=${todayIso()}&first_air_date.lte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}`,
      'landscape'
    )
  ]);

  return {
    hero: trending.slice(0, 6),
    sections: [
      { id: 'trending', title: 'Trending', style: 'landscape', items: trending },
      { id: 'people', title: 'Popular People', style: 'profile', items: popularPeople },
      { id: 'upcoming-movies', title: 'Upcoming Movies', style: 'landscape', items: upcomingMovies },
      { id: 'upcoming-series', title: 'Upcoming Series', style: 'landscape', items: upcomingSeries },
      { id: 'genres', title: 'Genres', style: 'genre', items: genreCards() },
      { id: 'digital', title: 'New Digital Releases', style: 'landscape', items: digitalReleases },
      { id: 'streaming', title: 'Streaming Now', style: 'landscape', items: streamingNow },
      { id: 'networks', title: 'TV Networks', style: 'network', items: networkCards() },
      { id: 'recently-added', title: 'Recently Added', style: 'landscape', items: library.recentlyAdded }
    ]
  };
}

async function buildAnimeHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const [
    hero,
    trendingSeries,
    trendingMovies,
    popularSeries,
    popularMovies,
    upcomingSeries,
    upcomingMovies
  ] = await Promise.all([
    tmdbResultCards(config, `/discover/tv?include_adult=false&sort_by=popularity.desc&watch_region=JP&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16&with_original_language=ja&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${daysAgoIso(90)}&include_adult=false&sort_by=popularity.desc&watch_region=JP&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16&with_original_language=ja&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?primary_release_date.gte=${daysAgoIso(360)}&include_adult=false&sort_by=popularity.desc&watch_region=JP&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16&with_original_language=ja&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?include_adult=false&sort_by=popularity.desc&watch_region=JP&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16&with_original_language=ja&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=JP&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16&with_original_language=ja&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}&with_original_language=ja&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?primary_release_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}&with_original_language=ja&with_watch_providers=${ANIME_PROVIDERS}&with_genres=16`, 'landscape')
  ]);

  return {
    hero: hero.slice(0, 6),
    sections: [
      { id: 'continue', title: 'Continue Watching', style: 'landscape', items: library.continueWatching },
      { id: 'anime-series-new', title: 'New & Trending Series', style: 'landscape', items: trendingSeries },
      { id: 'anime-movies-new', title: 'New & Trending Movies', style: 'landscape', items: trendingMovies },
      { id: 'anime-series-popular', title: 'Popular Series', style: 'landscape', items: popularSeries },
      { id: 'anime-movies-popular', title: 'Popular Movies', style: 'landscape', items: popularMovies },
      { id: 'anime-upcoming-series', title: 'Upcoming Series', style: 'landscape', items: upcomingSeries },
      { id: 'anime-upcoming-movies', title: 'Upcoming Movies', style: 'landscape', items: upcomingMovies }
    ]
  };
}

async function buildDoramaHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const [
    hero,
    trendingSeries,
    viki,
    disney,
    netflix,
    popularSeries,
    popularMovies,
    upcomingSeries,
    upcomingMovies
  ] = await Promise.all([
    tmdbResultCards(config, `/discover/tv?include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=${DORAMA_PROVIDERS}&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${daysAgoIso(40)}&include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=${DORAMA_PROVIDERS}&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${daysAgoIso(100)}&include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=344&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${daysAgoIso(150)}&include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=337&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${daysAgoIso(120)}&include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=8&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=${DORAMA_PROVIDERS}&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?include_adult=false&sort_by=popularity.desc&watch_region=US&with_watch_providers=${DORAMA_PROVIDERS}&with_original_language=ko&language=en-US`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}&with_original_language=ko&with_watch_providers=${DORAMA_PROVIDERS}`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?primary_release_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(config.preferences.language)}&with_original_language=ko`, 'landscape')
  ]);

  return {
    hero: hero.slice(0, 6),
    sections: [
      { id: 'continue', title: 'Continue Watching', style: 'landscape', items: library.continueWatching },
      { id: 'dorama-trending', title: 'New & Trending', style: 'landscape', items: trendingSeries },
      { id: 'dorama-viki', title: 'Popular on Viki', style: 'landscape', items: viki },
      { id: 'dorama-disney', title: 'Popular on Disney+', style: 'landscape', items: disney },
      { id: 'dorama-netflix', title: 'Popular on Netflix', style: 'landscape', items: netflix },
      { id: 'dorama-popular-series', title: 'Popular Series', style: 'landscape', items: popularSeries },
      { id: 'dorama-popular-movies', title: 'Popular Movies', style: 'landscape', items: popularMovies },
      { id: 'dorama-upcoming-series', title: 'Upcoming Series', style: 'landscape', items: upcomingSeries },
      { id: 'dorama-upcoming-movies', title: 'Upcoming Movies', style: 'landscape', items: upcomingMovies }
    ]
  };
}

async function buildLibraryHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const downloads = await getDownloads(config);

  return {
    hero: [...library.continueWatching, ...library.recentlyAdded].slice(0, 6),
    sections: [
      { id: 'continue', title: 'Continue Watching', style: 'landscape', items: library.continueWatching },
      { id: 'recent', title: 'Recently Added', style: 'landscape', items: library.recentlyAdded },
      { id: 'downloads', title: 'Downloading', style: 'episode', items: downloads.map(downloadToCard) }
    ]
  };
}

async function getTmdbSnapshot(config: AppConfig): Promise<{
  hero: MediaCard[];
  recommendations: MediaCard[];
  trendingSeries: MediaCard[];
}> {
  if (!getTmdbToken(config)) {
    return {
      hero: [],
      recommendations: [],
      trendingSeries: []
    };
  }

  const [trendingMovie, recommendedMovie, trendingSeries] = await Promise.all([
    tmdbFetch(config, `/trending/movie/week?language=${encodeURIComponent(config.preferences.language)}`),
    tmdbFetch(config, `/movie/popular?language=${encodeURIComponent(config.preferences.language)}&region=${encodeURIComponent(config.preferences.region)}`),
    tmdbFetch(config, `/tv/popular?language=${encodeURIComponent(config.preferences.language)}`)
  ]);

  return {
    hero: asArray(trendingMovie?.results)
      .slice(0, 6)
      .map((item) => tmdbToCard(asRecord(item), 'movie')),
    recommendations: asArray(recommendedMovie?.results)
      .slice(0, 12)
      .map((item) => tmdbToCard(asRecord(item), 'movie')),
    trendingSeries: asArray(trendingSeries?.results)
      .slice(0, 12)
      .map((item) => tmdbToCard(asRecord(item), 'tv'))
  };
}

async function getJellyfinUsers(config: AppConfig): Promise<SelectOption[]> {
  if (!config.jellyfin.baseUrl || !config.jellyfin.apiKey) {
    return [];
  }

  return getJellyfinUsersFromConfig(config.jellyfin.baseUrl, config.jellyfin.apiKey);
}

async function getJellyfinUsersFromConfig(baseUrl: string, apiKey: string): Promise<SelectOption[]> {
  const users = await fetchJson<Record<string, unknown>[]>(
    `${baseUrl}/Users`,
    {
      headers: {
        'X-Emby-Token': apiKey
      }
    }
  );

  return users.map((user) => ({
    id: String(user.Id || ''),
    label: String(user.Name || user.Id || 'User')
  }));
}

async function getSonarrRootFolders(config: AppConfig): Promise<SelectOption[]> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return [];
  }

  const folders = await fetchJson<Record<string, unknown>[]>(
    `${config.sonarr.baseUrl}/api/v3/rootFolder`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );

  return folders.map((folder) => ({
    id: String(folder.path || ''),
    label: String(folder.path || '')
  }));
}

async function getSonarrQualityProfiles(config: AppConfig): Promise<SelectOption[]> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return [];
  }

  const profiles = await fetchJson<Record<string, unknown>[]>(
    `${config.sonarr.baseUrl}/api/v3/qualityprofile`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );

  return profiles.map((profile) => ({
    id: String(profile.id || ''),
    label: String(profile.name || profile.id || 'Profile')
  }));
}

async function getSonarrLanguageProfiles(config: AppConfig): Promise<SelectOption[]> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return [];
  }

  const profiles = await fetchJson<Record<string, unknown>[]>(
    `${config.sonarr.baseUrl}/api/v3/languageprofile`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );

  return profiles.map((profile) => ({
    id: String(profile.id || ''),
    label: String(profile.name || profile.id || 'Language')
  }));
}

async function getRadarrRootFolders(config: AppConfig): Promise<SelectOption[]> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    return [];
  }

  const folders = await fetchJson<Record<string, unknown>[]>(
    `${config.radarr.baseUrl}/api/v3/rootFolder`,
    {
      headers: {
        'X-Api-Key': config.radarr.apiKey
      }
    }
  );

  return folders.map((folder) => ({
    id: String(folder.path || ''),
    label: String(folder.path || '')
  }));
}

async function getRadarrQualityProfiles(config: AppConfig): Promise<SelectOption[]> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    return [];
  }

  const profiles = await fetchJson<Record<string, unknown>[]>(
    `${config.radarr.baseUrl}/api/v3/qualityprofile`,
    {
      headers: {
        'X-Api-Key': config.radarr.apiKey
      }
    }
  );

  return profiles.map((profile) => ({
    id: String(profile.id || ''),
    label: String(profile.name || profile.id || 'Profile')
  }));
}

async function getSonarrQueue(config: AppConfig): Promise<SonarrQueueRecord[]> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return [];
  }

  const response = await fetchJson<{ records?: SonarrQueueRecord[] }>(
    `${config.sonarr.baseUrl}/api/v3/queue?includeSeries=true&includeEpisode=true`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );

  return response.records || [];
}

async function getRadarrQueue(config: AppConfig): Promise<RadarrQueueRecord[]> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    return [];
  }

  const response = await fetchJson<{ records?: RadarrQueueRecord[] }>(
    `${config.radarr.baseUrl}/api/v3/queue?includeMovie=true`,
    {
      headers: {
        'X-Api-Key': config.radarr.apiKey
      }
    }
  );

  return response.records || [];
}

async function getQbitQueue(config: AppConfig): Promise<QbitTorrent[]> {
  if (!config.qbittorrent.baseUrl || !config.qbittorrent.username || !config.qbittorrent.password) {
    return [];
  }

  const cookie = await loginQbit(config);
  const response = await fetchJson<QbitTorrent[]>(
    `${config.qbittorrent.baseUrl}/api/v2/torrents/info`,
    {
      headers: {
        Cookie: cookie
      }
    }
  );

  return response;
}

async function testJellyfin(config: AppConfig): Promise<ConnectionStatus> {
  if (!config.jellyfin.baseUrl || !config.jellyfin.apiKey) {
    return {
      key: 'jellyfin',
      label: 'Jellyfin',
      ok: false,
      message: 'Not configured'
    };
  }

  try {
    await fetchJson(`${config.jellyfin.baseUrl}/System/Info`, {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      }
    });
    return { key: 'jellyfin', label: 'Jellyfin', ok: true, message: 'Connected' };
  } catch (error) {
    return {
      key: 'jellyfin',
      label: 'Jellyfin',
      ok: false,
      message: errorMessage(error)
    };
  }
}

async function testSonarr(config: AppConfig): Promise<ConnectionStatus> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return {
      key: 'sonarr',
      label: 'Sonarr',
      ok: false,
      message: 'Not configured'
    };
  }

  try {
    await fetchJson(`${config.sonarr.baseUrl}/api/v3/health`, {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    });
    return { key: 'sonarr', label: 'Sonarr', ok: true, message: 'Connected' };
  } catch (error) {
    return {
      key: 'sonarr',
      label: 'Sonarr',
      ok: false,
      message: errorMessage(error)
    };
  }
}

async function testRadarr(config: AppConfig): Promise<ConnectionStatus> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    return {
      key: 'radarr',
      label: 'Radarr',
      ok: false,
      message: 'Not configured'
    };
  }

  try {
    await fetchJson(`${config.radarr.baseUrl}/api/v3/health`, {
      headers: {
        'X-Api-Key': config.radarr.apiKey
      }
    });
    return { key: 'radarr', label: 'Radarr', ok: true, message: 'Connected' };
  } catch (error) {
    return {
      key: 'radarr',
      label: 'Radarr',
      ok: false,
      message: errorMessage(error)
    };
  }
}

async function testQbittorrent(config: AppConfig): Promise<ConnectionStatus> {
  if (!config.qbittorrent.baseUrl || !config.qbittorrent.username || !config.qbittorrent.password) {
    return {
      key: 'qbittorrent',
      label: 'qBittorrent',
      ok: false,
      message: 'Not configured'
    };
  }

  try {
    await loginQbit(config);
    return { key: 'qbittorrent', label: 'qBittorrent', ok: true, message: 'Connected' };
  } catch (error) {
    return {
      key: 'qbittorrent',
      label: 'qBittorrent',
      ok: false,
      message: errorMessage(error)
    };
  }
}

async function testTmdb(config: AppConfig): Promise<ConnectionStatus> {
  if (!getTmdbToken(config)) {
    return {
      key: 'tmdb',
      label: 'TMDb',
      ok: false,
      message: 'Missing token'
    };
  }

  try {
    await tmdbFetch(config, '/configuration');
    return { key: 'tmdb', label: 'TMDb', ok: true, message: 'Connected' };
  } catch (error) {
    return {
      key: 'tmdb',
      label: 'TMDb',
      ok: false,
      message: errorMessage(error)
    };
  }
}

async function jellyfinFetch<T>(config: AppConfig, pathWithQuery: string): Promise<T> {
  const response = await fetchJson<{ Items?: T } | T>(
    `${config.jellyfin.baseUrl}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`,
    {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      }
    }
  );

  if (typeof response === 'object' && response && 'Items' in response) {
    return (response.Items ?? []) as T;
  }

  return response as T;
}

async function tmdbFetch(config: AppConfig, pathWithQuery: string): Promise<Record<string, unknown> | null> {
  const token = getTmdbToken(config);
  if (!token) {
    return null;
  }

  return fetchJson<Record<string, unknown>>(`https://api.themoviedb.org/3${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

async function loginQbit(config: AppConfig): Promise<string> {
  const response = await fetch(`${config.qbittorrent.baseUrl}/api/v2/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: new URLSearchParams({
      username: config.qbittorrent.username,
      password: config.qbittorrent.password
    })
  });

  if (!response.ok) {
    throw new Error(`qBittorrent ${response.status}`);
  }

  const cookie = response.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('qBittorrent did not return a session cookie.');
  }

  return cookie.split(';', 1)[0];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function jellyfinToCard(item: JellyfinItem, fallbackTitle: string): MediaCard | null {
  if (!item.Id) {
    return null;
  }

  const posterTag = item.ImageTags?.Primary || '';
  const backdropTag = item.BackdropImageTags?.[0] || posterTag;
  const progress = Math.round(item.UserData?.PlayedPercentage || 0);

  return {
    id: `jellyfin-${item.Id}`,
    tmdbId: Number(item.ProviderIds?.Tmdb) || undefined,
    providerId: item.Id,
    title: fallbackTitle,
    subtitle: item.Type === 'Episode'
      ? [item.SeriesName, formatEpisodeCode(item.ParentIndexNumber, item.IndexNumber)].filter(Boolean).join(' ')
      : item.ProductionYear
        ? String(item.ProductionYear)
        : item.Type || 'Library',
    overview: item.Overview || '',
    mediaType: item.Type === 'Movie' ? 'movie' : item.Type === 'Episode' ? 'episode' : 'series',
    posterUrl: `/api/assets/jellyfin/${item.Id}?kind=Primary&maxWidth=480&tag=${encodeURIComponent(posterTag)}`,
    backdropUrl: `/api/assets/jellyfin/${item.Id}?kind=Backdrop&maxWidth=1280&tag=${encodeURIComponent(backdropTag)}`,
    badge: item.Type || 'Jellyfin',
    progress: progress > 0 ? progress : undefined,
    secondaryValue: item.UserData?.Played ? 'Watched' : undefined
  };
}

function tmdbToCard(item: Record<string, unknown>, mediaType: 'movie' | 'tv'): MediaCard {
  const title = String(item.title || item.name || item.original_title || item.original_name || 'TMDb');
  const id = Number(item.id || 0);
  const posterPath = String(item.poster_path || '');
  const backdropPath = String(item.backdrop_path || '');
  const year = String(item.release_date || item.first_air_date || '').slice(0, 4);

  return {
    id: `tmdb-${mediaType}-${id}`,
    tmdbId: id,
    title,
    subtitle: year || (mediaType === 'movie' ? 'Movie' : 'Series'),
    overview: String(item.overview || ''),
    mediaType,
    posterUrl: posterPath ? `${TMDB_IMAGE}/w500${posterPath}` : '',
    backdropUrl: backdropPath ? `${TMDB_IMAGE}/w1280${backdropPath}` : '',
    badge: mediaType === 'movie' ? 'Radarr' : 'Sonarr',
    actionLabel: mediaType === 'movie' ? 'Add to Radarr' : 'Add to Sonarr'
  };
}

function customCard(partial: Partial<MediaCard> & Pick<MediaCard, 'id' | 'title'>): MediaCard {
  return {
    id: partial.id,
    title: partial.title,
    subtitle: partial.subtitle || '',
    overview: partial.overview || '',
    mediaType: partial.mediaType || 'mixed',
    posterUrl: partial.posterUrl || '',
    backdropUrl: partial.backdropUrl || partial.posterUrl || '',
    badge: partial.badge,
    progress: partial.progress,
    secondaryValue: partial.secondaryValue,
    actionLabel: partial.actionLabel,
    tmdbId: partial.tmdbId,
    providerId: partial.providerId,
    accent: partial.accent
  };
}

async function tmdbResultCards(
  config: AppConfig,
  pathWithQuery: string,
  style: HubSection['style']
): Promise<MediaCard[]> {
  try {
    const result = await tmdbFetch(config, pathWithQuery);
    return asArray(result?.results)
      .map((item) => tmdbToCard(asRecord(item), inferMediaType(pathWithQuery, asRecord(item))))
      .filter((card) => style === 'landscape' ? Boolean(card.backdropUrl) : Boolean(card.posterUrl))
      .slice(0, 18);
  } catch {
    return [];
  }
}

async function tmdbPeopleCards(config: AppConfig, pathWithQuery: string): Promise<MediaCard[]> {
  try {
    const result = await tmdbFetch(config, pathWithQuery);
    return asArray(result?.results)
      .map((item) => {
        const person = asRecord(item);
        const profilePath = String(person.profile_path || '');
        return customCard({
          id: `person-${person.id || ''}`,
          tmdbId: Number(person.id || 0) || undefined,
          title: String(person.name || 'Person'),
          subtitle: String(person.known_for_department || ''),
          mediaType: 'mixed',
          posterUrl: profilePath ? `${TMDB_IMAGE}/w342${profilePath}` : '',
          backdropUrl: profilePath ? `${TMDB_IMAGE}/w342${profilePath}` : '',
          badge: 'TMDb'
        });
      })
      .filter((card) => Boolean(card.posterUrl))
      .slice(0, 18);
  } catch {
    return [];
  }
}

function genreCards(): MediaCard[] {
  return GENRE_ASSETS.map((genre) =>
    customCard({
      id: `genre-${genre.id}`,
      title: genre.title,
      subtitle: 'Genre',
      mediaType: 'mixed',
      posterUrl: genre.posterUrl,
      backdropUrl: genre.posterUrl,
      badge: 'TMDb'
    })
  );
}

function networkCards(): MediaCard[] {
  return NETWORK_ASSETS.map((network) =>
    customCard({
      id: `network-${network.id}`,
      title: network.title,
      subtitle: 'Network',
      mediaType: 'mixed',
      posterUrl: network.posterUrl,
      backdropUrl: network.posterUrl,
      badge: 'TV'
    })
  );
}

function downloadToCard(download: DownloadItem): MediaCard {
  return customCard({
    id: `download-${download.id}`,
    title: download.title,
    subtitle: [download.detail, download.eta].filter(Boolean).join(' · '),
    overview: '',
    mediaType: 'episode',
    posterUrl: '/omniarr/downloads.png',
    backdropUrl: '/omniarr/downloads.png',
    badge: download.source,
    progress: download.progress,
    secondaryValue: download.speed || download.size || download.state
  });
}

function inferMediaType(pathWithQuery: string, item: Record<string, unknown>): 'movie' | 'tv' {
  if (pathWithQuery.includes('/tv') || item.media_type === 'tv') {
    return 'tv';
  }
  if (item.media_type === 'movie') {
    return 'movie';
  }
  return pathWithQuery.includes('/movie') ? 'movie' : 'tv';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function getTmdbToken(config: AppConfig): string {
  return process.env.TMDB_BEARER_TOKEN || config.tmdb.bearerToken;
}

function getQueueProgress(size?: number, sizeLeft?: number): number {
  if (!size || size <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(((size - (sizeLeft || 0)) / size) * 100)));
}

function formatEpisodeCode(season?: number, episode?: number): string {
  if (!season || !episode) {
    return '';
  }

  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('did not match the expected pattern')) {
      return 'One of the configured service URLs is invalid. Add http:// or https:// and verify the address.';
    }

    return error.message;
  }

  return 'Connection error';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
