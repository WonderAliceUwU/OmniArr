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
  SeriesId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
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
  console.log(`[getHubPage] Loading page: ${page}`);
  let library: { continueWatching: MediaCard[]; recentlyAdded: MediaCard[]; allItems: JellyfinItem[] };
  let downloads: DownloadItem[];

  try {
    [library, downloads] = await Promise.all([
      getLibrarySnapshot(config),
      getDownloads(config)
    ]);
  } catch (err) {
    console.error(`[getHubPage] Error fetching library/downloads for ${page}:`, err);
    library = { continueWatching: [], recentlyAdded: [], allItems: [] };
    downloads = [];
  }

  const allSections = await buildHubSections(config, library, page).catch((err) => {
    console.error(`[getHubPage] Error building hub sections for ${page}:`, err);
    return { hero: [], sections: [] };
  }) || { hero: [], sections: [] };

  console.log(`[getHubPage] Sections built for ${page}. Hero count: ${allSections.hero?.length}, Section count: ${allSections.sections?.length}`);
  const isNetworkPage = ['netflix', 'primevideo', 'hbo', 'viki', 'disney'].includes(page);
  if (page !== 'home' && !isNetworkPage && allSections.hero?.length === 0 && allSections.sections?.every(s => s.items.length === 0)) {
    console.log(`[getHubPage] Hub for ${page} is completely empty, using Home as fallback`);
    return getHubPage(config, 'home');
  }

  const backdropCache = new Map<string, Promise<string>>();
  const networkScopedContinueWatching = isNetworkPage
    ? (() => {
        const sectionTmdbIds = new Set(
          uniqueCards([...allSections.hero, ...allSections.sections.flatMap((section) => section.items)])
            .map((item) => item.tmdbId)
            .filter((value): value is number => Boolean(value))
        );
        const filtered = library.continueWatching.filter((card) => card.tmdbId && sectionTmdbIds.has(card.tmdbId));
        const minimumScopedItems = Math.min(3, library.continueWatching.length);
        return filtered.length >= minimumScopedItems ? filtered : library.continueWatching;
      })()
    : library.continueWatching;

  const [continueWatching, heroWithHighResBackdrops, sectionsWithHighResBackdrops] = await Promise.all([
    applyHighResBackdropsToCards(
      config,
      networkScopedContinueWatching,
      shouldUseHighResBackdropForCard,
      backdropCache,
      'en'
    ),
    applyHighResBackdropsToCards(
      config,
      (allSections && allSections.hero) || [],
      shouldUseHighResBackdropForCard,
      backdropCache,
      null
    ),
    applyHighResBackdropsToSections(
      config,
      (allSections && allSections.sections) || [],
      backdropCache,
      'en'
    )
  ]);

  return {
    page,
    hero: heroWithHighResBackdrops || [],
    continueWatching,
    sections: (sectionsWithHighResBackdrops || [])
      .filter((section) => section.items.some((item) => item.backdropUrl || item.posterUrl))
      .concat(
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
      jellyfinFetch<JellyfinItem[]>(config, `/Users/${config.jellyfin.userId}/Items/Resume?mediaTypes=Video&fields=ProviderIds,Overview,SeriesId,ParentBackdropItemId,ParentBackdropImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber`),
      jellyfinFetch<JellyfinItem[]>(config, `/Shows/NextUp?userId=${config.jellyfin.userId}&fields=ProviderIds,Overview,SeriesId,ParentBackdropItemId,ParentBackdropImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber`),
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

  const tmdbIdByItemId = new Map(
    allItems
      .filter((item) => item.Id)
      .map((item) => [String(item.Id), Number(item.ProviderIds?.Tmdb) || undefined] as const)
  );

  const continueWatching = [...resume, ...nextUp]
    .slice(0, 12)
    .map((item) => jellyfinToCard(item, item.SeriesName || item.Name || 'Continue watching', tmdbIdByItemId))
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
  console.log(`[buildHubSections] Routing for page: ${page}`);
  switch (page) {
    case 'stream':
      return buildStreamHub(config, library);
    case 'home':
      return buildHomeHub(config, library);
    case 'anime':
      return buildAnimeHub(config, library);
    case 'dorama':
      return buildDoramaHub(config, library);
    case 'netflix':
      return buildNetworkHub(config, library, 213, 'Netflix');
    case 'primevideo':
      return buildNetworkHub(config, library, 1024, 'Prime Video');
    case 'hbo':
      return buildNetworkHub(config, library, 49, 'HBO');
    case 'viki':
      return buildNetworkHub(config, library, 1595, 'Viki');
    case 'disney':
      return buildNetworkHub(config, library, 2739, 'Disney+');
    case 'library':
      return buildLibraryHub(config, library);
    default:
      console.warn(`[buildHubSections] No specific handler for page: ${page}, falling back to home`);
      return buildHomeHub(config, library);
  }
}

async function buildStreamHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const language = config.preferences.language || 'en-US';
  const region = config.preferences.region || 'US';

  const [trending, recommended, trendingSeries] = await Promise.all([
    tmdbResultCards(config, `/trending/movie/week?language=${encodeURIComponent(language)}`, 'landscape'),
    tmdbResultCards(config, `/movie/popular?language=${encodeURIComponent(language)}&region=${encodeURIComponent(region)}`, 'landscape'),
    tmdbResultCards(config, `/tv/popular?language=${encodeURIComponent(language)}`, 'landscape')
  ]);

  const filter = (items: MediaCard[]) => {
    const libraryTmdbIds = new Set(library.allItems.map((item) => Number(item.ProviderIds?.Tmdb)).filter(Boolean));
    return config.preferences.excludeLibraryItems
      ? items.filter(item => !item.tmdbId || !libraryTmdbIds.has(item.tmdbId))
      : items;
  };

  const filteredHero = filter(trending || []);
  const filteredRecommendations = filter(recommended || []);
  const filteredTrendingSeries = filter(trendingSeries || []);

  return {
    hero: filteredHero.slice(0, 6),
    sections: [
      {
        id: 'recommendations',
        title: 'Recommendations',
        style: 'landscape',
        items: filteredRecommendations.slice(0, 12)
      },
      {
        id: 'trending-series',
        title: 'Trending Series',
        style: 'landscape',
        items: filteredTrendingSeries.slice(0, 12)
      }
    ]
  };
}

async function buildHomeHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const language = config.preferences.language || 'en-US';
  const region = config.preferences.region || 'US';

  const [
    trending,
    upcomingMovies,
    upcomingSeries,
    digitalReleases,
    streamingNow
  ] = await Promise.all([
    tmdbResultCards(config, `/trending/all/day?language=${encodeURIComponent(language)}`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?primary_release_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(language)}&region=${encodeURIComponent(region)}`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?first_air_date.gte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(language)}`, 'landscape'),
    tmdbResultCards(config, `/discover/movie?with_release_type=4&sort_by=popularity.desc&release_date.lte=${todayIso()}&language=${encodeURIComponent(language)}`, 'landscape'),
    tmdbResultCards(config, `/discover/tv?air_date.gte=${todayIso()}&first_air_date.lte=${todayIso()}&sort_by=popularity.desc&language=${encodeURIComponent(language)}`, 'landscape')
  ]);

  const filter = (items: MediaCard[]) => {
    const libraryTmdbIds = new Set(library.allItems.map((item) => Number(item.ProviderIds?.Tmdb)).filter(Boolean));
    return config.preferences.excludeLibraryItems
      ? items.filter(item => !item.tmdbId || !libraryTmdbIds.has(item.tmdbId))
      : items;
  };

  const filteredHero = filter(trending || []);

  const heroCandidates = uniqueCards([
    ...filteredHero,
    ...filter(digitalReleases || []),
    ...filter(streamingNow || []),
    ...filter(upcomingMovies || []),
    ...filter(upcomingSeries || [])
  ])
    .filter((item) => item.backdropUrl || item.posterUrl)
    .slice(0, 6);

  return {
    hero: heroCandidates,
    sections: [
      { id: 'trending', title: 'Trending', style: 'landscape', items: filteredHero },
      { id: 'upcoming-movies', title: 'Upcoming Movies', style: 'landscape', items: filter(upcomingMovies || []) },
      { id: 'upcoming-series', title: 'Upcoming Series', style: 'landscape', items: filter(upcomingSeries || []) },
      { id: 'digital', title: 'New Digital Releases', style: 'landscape', items: filter(digitalReleases || []) },
      { id: 'streaming', title: 'Streaming Now', style: 'landscape', items: filter(streamingNow || []) },
      { id: 'recently-added', title: 'Recently Added', style: 'landscape', items: library.recentlyAdded || [] }
    ]
  };
}

async function buildAnimeHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const region = config.preferences.region || 'US';
  const language = config.preferences.language || 'en-US';
  const recentWindowDays = 365;
  const providerFilter = `watch_region=${encodeURIComponent(region)}&with_watch_providers=${ANIME_PROVIDERS}`;
  const animeFilter = `include_adult=false&with_genres=16&with_original_language=ja&language=${encodeURIComponent(language)}`;

  const [
    trendingShows,
    trendingMovies,
    fallbackTrendingMovies,
    allTimePopularShows,
    allTimePopularMovies,
    upcomingSeries,
    upcomingMovies
  ] = await Promise.all([
    tmdbPagedResultCards(
      config,
      `/discover/tv?sort_by=popularity.desc&first_air_date.gte=${daysAgoIso(recentWindowDays)}&first_air_date.lte=${todayIso()}&${providerFilter}&${animeFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${daysAgoIso(recentWindowDays)}&primary_release_date.lte=${todayIso()}&${providerFilter}&${animeFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=popularity.desc&${providerFilter}&${animeFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/tv?sort_by=vote_count.desc&${providerFilter}&${animeFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=vote_count.desc&${providerFilter}&${animeFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/tv?sort_by=popularity.desc&first_air_date.gte=${todayIso()}&include_adult=false&with_genres=16&with_original_language=ja&language=${encodeURIComponent(language)}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${todayIso()}&include_adult=false&with_genres=16&with_original_language=ja&language=${encodeURIComponent(language)}`,
      'landscape'
    )
  ]);

  const filter = (items: MediaCard[]) => {
    const libraryTmdbIds = new Set(library.allItems.map((item) => Number(item.ProviderIds?.Tmdb)).filter(Boolean));
    const uniqueItems = uniqueCards(items.filter(Boolean));
    return config.preferences.excludeLibraryItems
      ? uniqueItems.filter(item => !item.tmdbId || !libraryTmdbIds.has(item.tmdbId))
      : uniqueItems;
  };

  const filteredTrendingShows = filter(trendingShows || []);
  const filteredTrendingMovies = uniqueCards([
    ...filter(trendingMovies || []),
    ...filter(fallbackTrendingMovies || [])
  ]).slice(0, 12);
  const filteredAllTimePopular = uniqueCards([
    ...filter(allTimePopularShows || []),
    ...filter(allTimePopularMovies || [])
  ]);
  const filteredUpcoming = uniqueCards([
    ...filter(upcomingSeries || []),
    ...filter(upcomingMovies || [])
  ]);
  const filteredHero = uniqueCards([
    ...filteredTrendingShows,
    ...filteredTrendingMovies
  ]);

  const sections: HubSection[] = [
      { id: 'anime-trending-shows', title: 'Trending Shows', style: 'landscape', items: filteredTrendingShows },
      { id: 'anime-trending-movies', title: 'Trending Movies', style: 'landscape', items: filteredTrendingMovies },
      { id: 'anime-all-time-popular', title: 'All Time Popular', style: 'landscape', items: filteredAllTimePopular },
      { id: 'anime-upcoming', title: 'Upcoming', style: 'landscape', items: filteredUpcoming }
    ];

  return {
    hero: filteredHero.slice(0, 6),
    sections: sections.filter((section) => section.items.length > 0)
  };
}

async function buildDoramaHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const region = config.preferences.region || 'US';
  const language = config.preferences.language || 'en-US';
  const recentWindowDays = 365;
  const providerFilter = `watch_region=${encodeURIComponent(region)}&with_watch_providers=${DORAMA_PROVIDERS}`;
  const doramaFilter = `include_adult=false&with_original_language=ko&language=${encodeURIComponent(language)}`;

  const [
    trendingShows,
    trendingMovies,
    fallbackTrendingMovies,
    allTimePopularShows,
    allTimePopularMovies,
    upcomingSeries,
    upcomingMovies
  ] = await Promise.all([
    tmdbPagedResultCards(
      config,
      `/discover/tv?sort_by=popularity.desc&first_air_date.gte=${daysAgoIso(recentWindowDays)}&first_air_date.lte=${todayIso()}&${providerFilter}&${doramaFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${daysAgoIso(recentWindowDays)}&primary_release_date.lte=${todayIso()}&${providerFilter}&${doramaFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=popularity.desc&${providerFilter}&${doramaFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/tv?sort_by=vote_count.desc&${providerFilter}&${doramaFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=vote_count.desc&${providerFilter}&${doramaFilter}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/tv?sort_by=popularity.desc&first_air_date.gte=${todayIso()}&include_adult=false&with_original_language=ko&language=${encodeURIComponent(language)}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${todayIso()}&include_adult=false&with_original_language=ko&language=${encodeURIComponent(language)}`,
      'landscape'
    )
  ]);

  const filter = (items: MediaCard[]) => {
    const libraryTmdbIds = new Set(library.allItems.map((item) => Number(item.ProviderIds?.Tmdb)).filter(Boolean));
    const uniqueItems = uniqueCards(items.filter(Boolean));
    return config.preferences.excludeLibraryItems
      ? uniqueItems.filter(item => !item.tmdbId || !libraryTmdbIds.has(item.tmdbId))
      : uniqueItems;
  };

  const filteredTrendingShows = filter(trendingShows || []);
  const filteredTrendingMovies = uniqueCards([
    ...filter(trendingMovies || []),
    ...filter(fallbackTrendingMovies || [])
  ]).slice(0, 12);
  const filteredAllTimePopular = uniqueCards([
    ...filter(allTimePopularShows || []),
    ...filter(allTimePopularMovies || [])
  ]);
  const filteredUpcoming = uniqueCards([
    ...filter(upcomingSeries || []),
    ...filter(upcomingMovies || [])
  ]);
  const filteredHero = uniqueCards([
    ...filteredTrendingShows,
    ...filteredTrendingMovies
  ]);

  const sections: HubSection[] = [
    { id: 'dorama-trending-shows', title: 'Trending Shows', style: 'landscape', items: filteredTrendingShows },
    { id: 'dorama-trending-movies', title: 'Trending Movies', style: 'landscape', items: filteredTrendingMovies },
    { id: 'dorama-all-time-popular', title: 'All Time Popular', style: 'landscape', items: filteredAllTimePopular },
    { id: 'dorama-upcoming', title: 'Upcoming', style: 'landscape', items: filteredUpcoming }
  ];

  return {
    hero: filteredHero.slice(0, 6),
    sections: sections.filter((section) => section.items.length > 0)
  };
}

async function buildLibraryHub(
  config: AppConfig,
  library: Awaited<ReturnType<typeof getLibrarySnapshot>>
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const downloads = await getDownloads(config);

  return {
    hero: [...(library.continueWatching || []), ...(library.recentlyAdded || [])].slice(0, 6),
    sections: [
      { id: 'recent', title: 'Recently Added', style: 'landscape', items: library.recentlyAdded || [] },
      { id: 'downloads', title: 'Downloading', style: 'episode', items: (downloads || []).map(downloadToCard) }
    ]
  };
}

async function buildNetworkHub(
  config: AppConfig,
  _library: Awaited<ReturnType<typeof getLibrarySnapshot>>,
  networkId: number,
  title: string
): Promise<{ hero: MediaCard[]; sections: HubSection[] }> {
  const region = 'US';
  const language = config.preferences.language || 'en-US';
  const providerIdsByNetworkId: Record<number, number[]> = {
    213: [8, 175, 459, 1796],
    49: [27, 31, 118, 384, 425, 616, 1825, 1899],
    2739: [337, 390, 377, 508],
    1024: [9, 10, 119],
    453: [15],
    1595: [344],
    2552: [2, 350],
    344: [350]
  };
  const providerIdList = providerIdsByNetworkId[networkId] || [networkId];
  const providerIds = providerIdList.join('|');
  const providerFilter = `with_watch_providers=${providerIds}&watch_region=${encodeURIComponent(region)}&with_watch_monetization_types=flatrate`;
  const tvFilter = [1024, 2739].includes(networkId)
    ? `with_networks=${networkId}`
    : providerFilter;
  const recentTvWindowDays = 365;
  const recentMovieWindowDays = 365;

  console.log(`[buildNetworkHub] Building hub for ${title} (networkId: ${networkId}, providerIds: ${providerIds}, region: ${region})`);

  const [
    recentPopularShows,
    recentPopularMovies,
    fallbackPopularMovies,
    allTimePopularShows,
    allTimePopularMovies
  ] = await Promise.all([
    tmdbPagedResultCards(
      config,
      `/discover/tv?include_adult=false&sort_by=popularity.desc&first_air_date.gte=${daysAgoIso(recentTvWindowDays)}&first_air_date.lte=${todayIso()}&${tvFilter}&language=${encodeURIComponent(language)}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${daysAgoIso(recentMovieWindowDays)}&primary_release_date.lte=${todayIso()}&${providerFilter}&language=${encodeURIComponent(language)}`,
      'landscape'
    ),
    networkId === 2739
      ? tmdbPagedResultCards(
          config,
          `/discover/movie?include_adult=false&sort_by=popularity.desc&${providerFilter}&language=${encodeURIComponent(language)}`,
          'landscape'
        )
      : Promise.resolve([]),
    tmdbPagedResultCards(
      config,
      `/discover/tv?include_adult=false&sort_by=vote_count.desc&${tvFilter}&language=${encodeURIComponent(language)}`,
      'landscape'
    ),
    tmdbPagedResultCards(
      config,
      `/discover/movie?include_adult=false&sort_by=vote_count.desc&${providerFilter}&language=${encodeURIComponent(language)}`,
      'landscape'
    )
  ]);
  const filter = (items: MediaCard[]) => uniqueCards(items.filter(Boolean));
  const filteredRecentPopularShows = filter(recentPopularShows);
  const filteredRecentPopularMovies = networkId === 2739
    ? uniqueCards([
        ...filter(recentPopularMovies),
        ...filter(fallbackPopularMovies)
      ]).slice(0, 12)
    : filter(recentPopularMovies);
  const filteredAllTimePopular = uniqueCards([
    ...filter(allTimePopularShows),
    ...filter(allTimePopularMovies)
  ]);
  const hero = uniqueCards([
    ...filteredRecentPopularShows,
    ...filteredRecentPopularMovies
  ]).slice(0, 6);

  const sectionCandidates: HubSection[] = [
    { id: 'network-trending-shows', title: `Trending Shows on ${title}`, style: 'landscape', items: filteredRecentPopularShows },
    { id: 'network-trending-movies', title: `Trending Movies on ${title}`, style: 'landscape', items: filteredRecentPopularMovies },
    { id: 'network-all-time-popular', title: `All Time Popular on ${title}`, style: 'landscape', items: filteredAllTimePopular }
  ];
  const sections = sectionCandidates.filter((section) => section.items.length > 0);

  return { hero, sections };
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
    console.warn('TMDb token is missing');
    return null;
  }

  try {
    return await fetchJson<Record<string, unknown>>(`https://api.themoviedb.org/3${pathWithQuery}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (err) {
    console.error(`TMDb fetch failed for ${pathWithQuery}:`, err);
    return null;
  }
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

function jellyfinToCard(
  item: JellyfinItem,
  fallbackTitle: string,
  tmdbIdByItemId?: Map<string, number | undefined>
): MediaCard | null {
  if (!item.Id) {
    return null;
  }

  const posterTag = item.ImageTags?.Primary || '';
  const backdropItemId = item.ParentBackdropItemId || item.Id;
  const backdropTag = item.ParentBackdropImageTags?.[0] || item.BackdropImageTags?.[0] || posterTag;
  const progress = Math.round(item.UserData?.PlayedPercentage || 0);
  const tmdbId = Number(item.ProviderIds?.Tmdb) || (item.SeriesId ? tmdbIdByItemId?.get(item.SeriesId) : undefined);
  const episodeCode = formatEpisodeCode(item.ParentIndexNumber, item.IndexNumber);

  return {
    id: `jellyfin-${item.Id}`,
    tmdbId,
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
    backdropUrl: `/api/assets/jellyfin/${backdropItemId}?kind=Backdrop&maxWidth=1280&tag=${encodeURIComponent(backdropTag)}`,
    badge: item.Type || 'Jellyfin',
    progress: progress > 0 ? progress : undefined,
    secondaryValue: item.UserData?.Played ? 'Watched' : undefined,
    hoverLabel: item.Type === 'Movie'
      ? formatPlaybackTime(item.UserData?.PlaybackPositionTicks)
      : item.Type === 'Episode' && episodeCode
        ? `${item.UserData?.PlaybackPositionTicks ? 'Current' : 'Next'} ${episodeCode}`
        : undefined
  };
}

function tmdbToCard(item: Record<string, unknown>, mediaType: 'movie' | 'tv'): MediaCard {
  const title = String(item.title || item.name || item.original_title || item.original_name || 'TMDb');
  const id = Number(item.id || 0);
  const posterPath = String(item.poster_path || '');
  const backdropPath = String(item.backdrop_path || '');
  const releaseDate = String(item.release_date || item.first_air_date || '');
  const firstAirDate = mediaType === 'tv' ? String(item.first_air_date || '') : '';
  const genreIds = asArray(item.genre_ids).map((value) => Number(value)).filter(Boolean);
  const originalLanguage = String(item.original_language || '');
  const year = releaseDate.slice(0, 4);

  return {
    id: `tmdb-${mediaType}-${id}`,
    tmdbId: id,
    title,
    subtitle: year || (mediaType === 'movie' ? 'Movie' : 'Series'),
    overview: String(item.overview || ''),
    mediaType,
    posterUrl: posterPath ? `${TMDB_IMAGE}/w500${posterPath}` : '',
    backdropUrl: backdropPath ? `${TMDB_IMAGE}/original${backdropPath}` : '',
    badge: mediaType === 'movie' ? 'Radarr' : 'Sonarr',
    actionLabel: mediaType === 'movie' ? 'Add to Radarr' : 'Add to Sonarr',
    popularity: Number(item.popularity || 0) || undefined,
    voteAverage: Number(item.vote_average || 0) || undefined,
    voteCount: Number(item.vote_count || 0) || undefined,
    originalLanguage: originalLanguage || undefined,
    releaseDate: releaseDate || undefined,
    firstAirDate: firstAirDate || undefined,
    genreIds: genreIds.length ? genreIds : undefined
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
    logoUrl: partial.logoUrl,
    badge: partial.badge,
    progress: partial.progress,
    secondaryValue: partial.secondaryValue,
    actionLabel: partial.actionLabel,
    tmdbId: partial.tmdbId,
    providerId: partial.providerId,
    accent: partial.accent,
    popularity: partial.popularity,
    voteAverage: partial.voteAverage,
    voteCount: partial.voteCount,
    originalLanguage: partial.originalLanguage,
    releaseDate: partial.releaseDate,
    firstAirDate: partial.firstAirDate,
    lastAirDate: partial.lastAirDate,
    seasonCount: partial.seasonCount,
    mediaStatus: partial.mediaStatus,
    genreIds: partial.genreIds
  };
}

async function tmdbResultCards(
  config: AppConfig,
  pathWithQuery: string,
  style: HubSection['style']
): Promise<MediaCard[]> {
  try {
    const result = await tmdbFetch(config, pathWithQuery);
    if (!result || !result.results || (Array.isArray(result.results) && result.results.length === 0)) {
      console.warn(`TMDb returned no results for ${pathWithQuery}`);
      // Do not broaden provider-scoped discover queries. Upcoming provider rows can become
      // cross-platform noise if watch_region is stripped and TMDb stops honoring the provider.
      if (
        pathWithQuery.includes('/discover/') &&
        pathWithQuery.includes('watch_region') &&
        !pathWithQuery.includes('with_watch_providers=')
      ) {
          const fallbackPath = pathWithQuery.replace(/&watch_region=[^&]*/, '');
          if (fallbackPath !== pathWithQuery) {
              console.log(`[tmdbResultCards] Retrying TMDb without region filter: ${fallbackPath}`);
              return tmdbResultCards(config, fallbackPath, style);
          }
      }
      return [];
    }
  const cards = asArray(result?.results)
    .map((item) => tmdbToCard(asRecord(item), inferMediaType(pathWithQuery, asRecord(item))))
    .filter((card) => (style === 'landscape' ? Boolean(card.backdropUrl) : Boolean(card.posterUrl)))
    .slice(0, 18);

  if (cards.length === 0 && asArray(result?.results).length > 0) {
    console.log(`TMDb results filtered out by style (${style}), retrying without style filter`);
    const allCards = asArray(result?.results)
      .map((item) => tmdbToCard(asRecord(item), inferMediaType(pathWithQuery, asRecord(item))))
      .slice(0, 18);
    console.log(`TMDb fetched ${allCards.length} cards (fallback) for ${pathWithQuery}`);
    return allCards;
  }

    console.log(`TMDb fetched ${cards.length} cards for ${pathWithQuery}`);
    return cards;
  } catch (err) {
    console.error(`Error fetching TMDb cards from ${pathWithQuery}:`, err);
    return [];
  }
}

async function tmdbPagedResultCards(
  config: AppConfig,
  pathWithQuery: string,
  style: HubSection['style'],
  pageCount = 3
): Promise<MediaCard[]> {
  const paths = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    return `${pathWithQuery}${pathWithQuery.includes('?') ? '&' : '?'}page=${page}`;
  });

  const pages = await Promise.all(paths.map((path) => tmdbResultCards(config, path, style)));
  return uniqueCards(pages.flat()).slice(0, 36);
}

function downloadToCard(download: DownloadItem): MediaCard {
  return customCard({
    id: `download-${download.id}`,
    title: download.title,
    subtitle: [download.detail, download.eta].filter(Boolean).join(' · '),
    overview: '',
    mediaType: 'episode',
    posterUrl: '/reiverr/downloads.png',
    backdropUrl: '/reiverr/downloads.png',
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

function uniqueCards(items: MediaCard[]): MediaCard[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

// Match TMDb's English backdrop tab for landscape cards where available.
async function applyHighResBackdropsToSections(
  config: AppConfig,
  sections: HubSection[],
  backdropCache: Map<string, Promise<string>>,
  preferredLanguage?: string | null
): Promise<HubSection[]> {
  return Promise.all(
    sections.map(async (section) => {
      if (section.style !== 'landscape') {
        return section;
      }

      const items = await applyHighResBackdropsToCards(
        config,
        section.items,
        shouldUseHighResBackdropForCard,
        backdropCache,
        preferredLanguage
      );

      return {
        ...section,
        items
      };
    })
  );
}

async function applyHighResBackdropsToCards(
  config: AppConfig,
  cards: MediaCard[],
  shouldApply: (card: MediaCard) => boolean,
  backdropCache: Map<string, Promise<string>>,
  preferredLanguage?: string | null
): Promise<MediaCard[]> {
  return Promise.all(
    cards.map(async (card) => {
      if (!shouldApply(card)) {
        return card;
      }

      const mediaType: 'movie' | 'tv' = card.mediaType === 'movie' ? 'movie' : 'tv';
      const cacheKey = `${mediaType}:${card.tmdbId}:${preferredLanguage || 'any'}`;
      let backdropPromise = backdropCache.get(cacheKey);
      if (!backdropPromise) {
        backdropPromise = getTmdbHighResBackdrop(config, card.tmdbId!, mediaType, preferredLanguage);
        backdropCache.set(cacheKey, backdropPromise);
      }

      const backdropUrl = await backdropPromise;
      return backdropUrl
        ? {
            ...card,
            backdropUrl
          }
        : card;
    })
  );
}

function shouldUseHighResBackdropForCard(card: MediaCard): boolean {
  return Boolean(
    card.tmdbId
    && (
      card.mediaType === 'movie'
      || card.mediaType === 'tv'
      || card.mediaType === 'series'
      || card.mediaType === 'episode'
    )
  );
}

function tmdbImagesPath(tmdbId: number, mediaType: 'movie' | 'tv'): string {
  return `/${mediaType}/${tmdbId}/images?include_image_language=en,en-US,null`;
}

function formatPlaybackTime(playbackPositionTicks?: number): string | undefined {
  if (!playbackPositionTicks || playbackPositionTicks <= 0) {
    return undefined;
  }

  const totalSeconds = Math.floor(playbackPositionTicks / 10_000_000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export async function getTmdbLogos(
  config: AppConfig,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<Array<{ file_path: string; iso_639_1: string | null }>> {
  try {
    const response = await tmdbFetch(
      config,
      tmdbImagesPath(tmdbId, mediaType)
    );
    const logos = asArray(response?.logos)
      .map((entry) => asRecord(entry))
      .filter((entry) => typeof entry.file_path === 'string' && entry.file_path)
      .map((entry) => ({
        file_path: String(entry.file_path),
        iso_639_1: typeof entry.iso_639_1 === 'string' ? entry.iso_639_1 : null
      }));
    return logos;
  } catch {
    return [];
  }
}

async function getTmdbHighResBackdrop(
  config: AppConfig,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  preferredLanguage?: string | null
): Promise<string> {
  try {
    const response = await tmdbFetch(config, tmdbImagesPath(tmdbId, mediaType));
    let backdrops = asArray(response?.backdrops)
      .map((entry) => asRecord(entry));
    
    if (backdrops.length === 0) {
      return '';
    }

    // Filter by language if requested
    if (preferredLanguage) {
      const filtered = backdrops.filter(
        (b) => String(b.iso_639_1) === preferredLanguage
      );
      if (filtered.length > 0) {
        backdrops = filtered;
      }
    }

    // Sort by width descending if no language preference (Carousel use case)
    if (!preferredLanguage) {
      backdrops.sort((a, b) => Number(b.width || 0) - Number(a.width || 0));
    }

    // The first one is the first available one (after language filter and/or sorting)
    const selectedBackdrop = backdrops.find(
      (entry) => typeof entry.file_path === 'string' && entry.file_path
    );

    return selectedBackdrop?.file_path ? `${TMDB_IMAGE}/original${String(selectedBackdrop.file_path)}` : '';
  } catch {
    return '';
  }
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
