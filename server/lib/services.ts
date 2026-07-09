import type {
  AppConfig,
  CalendarEntry,
  CalendarResponse,
  ConnectionStatus,
  DashboardResponse,
  DownloadItem,
  EpisodeRequestPayload,
  EpisodeWatchStateRequest,
  HubPageResponse,
  HubSection,
  MediaCard,
  SeasonDeletePayload,
  SeasonRequestPayload,
  SelectOption,
  ServiceOptionsResponse,
  TitleDetailsEpisode,
  TitleDetailsRequest,
  TitleDetailsResponse,
  TitleDetailsSeason,
  TitleDetailsCastMember
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
  ChildCount?: number;
  IndexNumberEnd?: number;
  PremiereDate?: string;
}

interface SonarrQueueRecord {
  id?: number;
  seriesId?: number;
  title?: string;
  downloadId?: string;
  series?: { title?: string; tmdbId?: number; images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }> };
  episode?: { seasonNumber?: number; episodeNumber?: number; title?: string };
  trackedDownloadState?: string;
  sizeleft?: number;
  size?: number;
  status?: string;
  timeleft?: string;
}

interface SonarrCommandRecord {
  id?: number;
  name?: string;
  commandName?: string;
  status?: string;
  state?: string;
  body?: {
    seriesId?: number;
    seasonNumber?: number;
    episodeIds?: number[];
  };
}

interface SonarrCalendarRecord {
  id?: number;
  title?: string;
  airDate?: string;
  airDateUtc?: string;
  overview?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  hasFile?: boolean;
  monitored?: boolean;
  series?: {
    title?: string;
    tmdbId?: number;
    images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
    year?: number;
    status?: string;
  };
}

interface RadarrQueueRecord {
  id?: number;
  title?: string;
  movie?: { id?: number; title?: string; tmdbId?: number; year?: number; images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }> };
  trackedDownloadState?: string;
  sizeleft?: number;
  size?: number;
  status?: string;
  timeleft?: string;
}

interface RadarrCommandRecord {
  id?: number;
  name?: string;
  commandName?: string;
  status?: string;
  state?: string;
  body?: {
    movieIds?: number[];
  };
}

interface RadarrMovieRecord {
  id?: number;
  tmdbId?: number;
  title?: string;
  year?: number;
  hasFile?: boolean;
  monitored?: boolean;
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
}

interface RadarrCalendarRecord {
  id?: number;
  tmdbId?: number;
  title?: string;
  year?: number;
  overview?: string;
  status?: string;
  inCinemas?: string;
  physicalRelease?: string;
  digitalRelease?: string;
  monitored?: boolean;
  hasFile?: boolean;
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
}

interface DownloadMetadataHint {
  query: string;
  mediaType: 'movie' | 'tv';
  subtitle?: string;
}

interface TmdbBackdropChoice {
  url: string;
  backdropLanguageFallback: boolean;
}

interface TvdbSeriesRecord {
  id?: number;
  name?: string;
  overview?: string;
  image?: string;
  artworks?: Array<{ image?: string; type?: number }>;
  seasons?: Array<{
    id?: number;
    number?: number;
    image?: string;
    name?: string;
    type?: {
      name?: string;
      type?: string;
    };
  }>;
}

interface TvdbEpisodeRecord {
  id?: number;
  name?: string;
  overview?: string;
  image?: string;
  aired?: string;
  seasonNumber?: number;
  number?: number;
  runtime?: number;
}

interface TvdbTranslationRecord {
  name?: string;
  overview?: string;
}

interface SonarrSeriesRecord {
  id?: number;
  title?: string;
  tmdbId?: number;
  tvdbId?: number;
  seasons?: Array<{
    seasonNumber?: number;
    monitored?: boolean;
  }>;
  qualityProfileId?: number;
  languageProfileId?: number;
  rootFolderPath?: string;
  seasonFolder?: boolean;
  monitored?: boolean;
  seriesType?: string;
  titleSlug?: string;
  path?: string;
  addOptions?: Record<string, unknown>;
}

interface SonarrEpisodeRecord {
  id?: number;
  seriesId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
  overview?: string;
  airDateUtc?: string;
  runtime?: number;
  monitored?: boolean;
  hasFile?: boolean;
  episodeFileId?: number;
}

interface SonarrEpisodeFileRecord {
  id?: number;
  seriesId?: number;
  seasonNumber?: number;
  relativePath?: string;
  path?: string;
  size?: number;
}

interface TmdbSeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount?: number;
}

interface TmdbEpisodeRecord {
  episode_number?: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
  air_date?: string;
  runtime?: number;
}

interface SeriesSeasonDescriptor {
  id: string;
  title: string;
  seasonNumber?: number;
  episodeCount?: number;
  jellyfinSeasonId?: string;
  imageUrl?: string;
}

const ANIME_PROVIDERS = '337|8|9|430|283';
const DORAMA_PROVIDERS = '344|337|8|9|464';
let tvdbTokenCache: { token: string; expiresAt: number } | null = null;

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
    tmdb: {
      bearerToken: input.tmdb.bearerToken.trim()
    },
    tvdb: {
      apiKey: input.tvdb.apiKey.trim()
    }
  };
}

export async function getConnectionStatuses(config: AppConfig): Promise<ConnectionStatus[]> {
  const [jellyfin, sonarr, radarr, tmdb, tvdb] = await Promise.all([
    testJellyfin(config),
    testSonarr(config),
    testRadarr(config),
    testTmdb(config),
    testTvdb(config)
  ]);

  return [jellyfin, sonarr, radarr, tmdb, tvdb];
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

  const backdropCache = new Map<string, Promise<TmdbBackdropChoice>>();
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
  const continueWatchingWithLogos = await applyTitleLogosToCards(config, continueWatching || []);
  const heroWithLogos = await applyTitleLogosToCards(config, heroWithHighResBackdrops || []);
  const sectionsWithLogos = await applyTitleLogosToSections(config, sectionsWithHighResBackdrops || []);

  return {
    page,
    hero: heroWithLogos,
    continueWatching: continueWatchingWithLogos,
    sections: sectionsWithLogos
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
  const [sonarrResult, radarrResult] = await Promise.allSettled([
    getSonarrQueue(config),
    getRadarrQueue(config)
  ]);

  const sonarr = sonarrResult.status === 'fulfilled' ? sonarrResult.value : [];
  const radarr = radarrResult.status === 'fulfilled' ? radarrResult.value : [];

  const metadataCache = new Map<string, Promise<Partial<DownloadItem>>>();
  const baseDownloads: DownloadItem[] = [
    ...sonarr.map((item): DownloadItem => ({
      id: `sonarr-${item.id ?? Math.random()}`,
      source: 'sonarr',
      title: item.series?.title || item.title || 'Series',
      detail: item.title || 'Downloading episode',
      subtitle: formatEpisodeSubtitle(item.episode, item.title),
      progress: getQueueProgress(item.size, item.sizeleft),
      state: item.status || item.trackedDownloadState || 'queue',
      eta: item.timeleft || '',
      size: item.size ? formatBytes(item.size) : '',
      tmdbId: item.series?.tmdbId,
      posterUrl: extractRemoteImage(item.series?.images),
      backdropUrl: undefined,
      mediaType: 'tv',
      speed: undefined
    })),
    ...radarr.map((item): DownloadItem => ({
      id: `radarr-${item.id ?? Math.random()}`,
      source: 'radarr',
      title: item.movie?.title || item.title || 'Movie',
      detail: item.title || 'Downloading movie',
      subtitle: item.movie?.year ? String(item.movie.year) : 'Movie',
      progress: getQueueProgress(item.size, item.sizeleft),
      state: item.status || item.trackedDownloadState || 'queue',
      eta: item.timeleft || '',
      size: item.size ? formatBytes(item.size) : '',
      tmdbId: item.movie?.tmdbId,
      posterUrl: extractRemoteImage(item.movie?.images),
      backdropUrl: undefined,
      mediaType: 'movie',
      speed: undefined
    }))
  ];

  const downloads = await Promise.all(
    baseDownloads.map((item) => enrichDownloadItem(config, item, metadataCache))
  );
  return downloads.sort((a, b) => b.progress - a.progress);
}

export async function getCalendar(config: AppConfig): Promise<CalendarResponse> {
  const start = startOfToday()
  const end = addDays(start, 30)

  const [sonarrResult, radarrResult] = await Promise.allSettled([
    getSonarrCalendar(config, start, end),
    getRadarrCalendar(config, start, end)
  ])

  const sonarrItems = sonarrResult.status === 'fulfilled'
    ? sonarrResult.value.map((item) => mapSonarrCalendarEntry(item))
    : []
  const radarrItems = radarrResult.status === 'fulfilled'
    ? radarrResult.value.map((item) => mapRadarrCalendarEntry(item))
    : []

  const allItems = [...sonarrItems, ...radarrItems]
      .filter((item): item is CalendarEntry => Boolean(item));

  const backdropCache = new Map<string, Promise<TmdbBackdropChoice>>();
  const cards = await applyHighResBackdropsToCards(config, allItems.map(i => i.card), shouldUseHighResBackdropForCard, backdropCache, 'en');

  const itemsWithBackdrops = allItems.map(item => {
    const correspondingCard = cards.find(c => c.id === item.card.id);
    if (correspondingCard && correspondingCard.backdropUrl) {
      return {
        ...item,
        imageUrl: correspondingCard.backdropUrl,
        card: correspondingCard
      }
    }
    return item;
  });

  return {
    items: itemsWithBackdrops
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
  }
}

export async function searchTitles(
  config: AppConfig,
  rawQuery: string
): Promise<{ query: string; items: MediaCard[] }> {
  const query = rawQuery.trim();
  if (!query) {
    return { query: '', items: [] };
  }

  const library = await getLibrarySnapshot(config);
  const libraryCards = library.allItems
    .map((item) => jellyfinToCard(item, item.Name || 'Library'))
    .filter(Boolean) as MediaCard[];
  const normalizedQuery = normalizeSearchValue(query);
  const libraryMatches = libraryCards.filter((card) => {
    const haystack = normalizeSearchValue([card.title, card.subtitle].filter(Boolean).join(' '));
    return haystack.includes(normalizedQuery);
  });

  const libraryCardByTmdbId = new Map(
    libraryCards
      .filter((card) => card.tmdbId)
      .map((card) => [card.tmdbId!, card] as const)
  );

  const remoteResults = await tmdbFetch(
    config,
    `/search/multi?query=${encodeURIComponent(query)}&language=${encodeURIComponent(config.preferences.language)}&include_adult=false`
  );

  const remoteCards = asArray(remoteResults?.results)
    .map((entry) => asRecord(entry))
    .filter((entry) => entry.media_type === 'movie' || entry.media_type === 'tv')
    .map((entry) => {
      const mediaType = entry.media_type === 'movie' ? 'movie' : 'tv';
      const card = tmdbToCard(entry, mediaType);
      const libraryMatch = card.tmdbId ? libraryCardByTmdbId.get(card.tmdbId) : undefined;
      return libraryMatch
        ? {
            ...card,
            providerId: libraryMatch.providerId,
            badge: libraryMatch.badge,
            progress: libraryMatch.progress,
            secondaryValue: libraryMatch.secondaryValue,
            hoverLabel: libraryMatch.hoverLabel
          }
        : card;
    });

  const searchBackdropCache = new Map<string, Promise<TmdbBackdropChoice>>();
  const enrichedCards = await applyTitleLogosToCards(
    config,
    await applyHighResBackdropsToCards(
      config,
      uniqueSearchCards([...libraryMatches, ...remoteCards]).slice(0, 36),
      shouldUseHighResBackdropForCard,
      searchBackdropCache,
      'en'
    )
  );

  return {
    query,
    items: enrichedCards.filter((card) => Boolean(card.backdropUrl))
  };
}

export async function removeDownload(config: AppConfig, id: string): Promise<void> {
  const [source, rawId] = id.split('-', 2);
  if (!source || !rawId) {
    throw new Error('Invalid download id.');
  }

  if (source !== 'sonarr' && source !== 'radarr') {
    throw new Error('Unsupported download source.');
  }

  const baseUrl = source === 'sonarr' ? config.sonarr.baseUrl : config.radarr.baseUrl;
  const apiKey = source === 'sonarr' ? config.sonarr.apiKey : config.radarr.apiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(`${source === 'sonarr' ? 'Sonarr' : 'Radarr'} is not configured.`);
  }

  const response = await fetch(
    `${baseUrl}/api/v3/queue/${encodeURIComponent(rawId)}?removeFromClient=true&blocklist=false&skipRedownload=false`,
    {
      method: 'DELETE',
      headers: {
        'X-Api-Key': apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`${source === 'sonarr' ? 'Sonarr' : 'Radarr'} ${response.status} ${response.statusText}`);
  }
}

export async function getTitleDetails(
  config: AppConfig,
  request: TitleDetailsRequest
): Promise<TitleDetailsResponse> {
  const { card, seasonId } = request;
  const item = card.providerId ? await getJellyfinItemDetails(config, card.providerId) : null;
  const seriesItem = await resolveSeriesItem(config, card, item);
  const primaryItem = seriesItem || item;
  const isSeries = card.mediaType === 'series' || card.mediaType === 'tv' || seriesItem?.Type === 'Series' || item?.Type === 'Episode';
  const detailMediaType: 'movie' | 'tv' = primaryItem?.Type === 'Movie' || card.mediaType === 'movie' ? 'movie' : 'tv';
  const tvdbId = Number(primaryItem?.ProviderIds?.Tvdb) || undefined;
  const tmdbId = Number(primaryItem?.ProviderIds?.Tmdb) || card.tmdbId || await resolveTmdbSeriesIdByTvdbId(config, tvdbId);
  const originalLanguage = card.originalLanguage;
  const [backdropUrl, logoUrl] = await Promise.all([
    tmdbId ? getTmdbHighResBackdrop(config, tmdbId, detailMediaType, null, originalLanguage) : Promise.resolve(''),
    tmdbId ? getPreferredTitleLogo(config, tmdbId, detailMediaType) : Promise.resolve('')
  ]);

  const fallbackTitle = seriesItem?.Name || primaryItem?.Name || card.title;
  const fallbackOverview = seriesItem?.Overview || primaryItem?.Overview || card.overview;
  const subtitle = buildTitleSubtitle(seriesItem || item, card);
  const posterUrl = resolvePrimaryPoster(seriesItem || item, card);
  const effectiveBackdropUrl = backdropUrl || resolveBackdrop(seriesItem || item, card);

  if (!isSeries) {
    const [radarrMovie, radarrQueue, radarrCommands] = tmdbId
      ? await Promise.all([
          getRadarrMovieRecord(config, tmdbId),
          getRadarrQueue(config),
          getRadarrCommands(config)
        ])
      : [null, [], []];
    const radarrQueueEntry = radarrMovie?.id
      ? radarrQueue.find((entry) => entry.movie?.id === radarrMovie.id || entry.movie?.tmdbId === tmdbId)
      : radarrQueue.find((entry) => entry.movie?.tmdbId === tmdbId);
    const isDownloadingInRadarr = Boolean(radarrQueueEntry);
    const radarrMovieId = radarrMovie?.id;
    const isProcessingInRadarr = Boolean(
      !isDownloadingInRadarr
      && radarrMovieId
      && radarrCommands.some((command) => isActiveMovieSearchCommand(command, radarrMovieId))
    );
    const movieDetails = tmdbId ? await getTmdbMovieSummary(config, tmdbId) : null;
    return {
      id: card.id,
      tmdbId,
      providerId: item?.Id || card.providerId,
      radarrMovieId,
      playTargetId: item?.Id || card.providerId,
      availableInJellyfin: Boolean(item?.Id || card.providerId),
      title: fallbackTitle,
      overview: fallbackOverview,
      subtitle,
      mediaType: 'movie',
      posterUrl,
      backdropUrl: effectiveBackdropUrl,
      logoUrl: logoUrl || card.logoUrl,
      requestStatus: isDownloadingInRadarr ? 'downloading' : isProcessingInRadarr ? 'processing' : 'idle',
      requestProgress: isDownloadingInRadarr ? getMovieQueueProgress(radarrQueueEntry) : undefined,
      seasons: [],
      episodes: [],
      cast: buildTitleCast(movieDetails, 'movie')
    };
  }

  const [tmdbSeries, jellyfinSeasons, nextEpisode] = await Promise.all([
    tmdbId ? getTmdbSeriesSummary(config, tmdbId) : Promise.resolve(null),
    seriesItem?.Id ? getJellyfinSeriesSeasons(config, seriesItem.Id) : Promise.resolve([]),
    seriesItem?.Id ? getNextEpisodeToPlay(config, seriesItem.Id) : Promise.resolve(null)
  ]);
  const resolvedTvdbId = Number(asRecord(tmdbSeries?.external_ids).tvdb_id || tvdbId || 0) || undefined;
  const sonarrSeries = await getSonarrSeriesRecord(
    config,
    Number(resolvedTvdbId || 0),
    tmdbId
  );
  const sonarrContext = sonarrSeries?.id
    ? await getSonarrSeriesContext(config, sonarrSeries.id)
    : { episodes: [], queue: [], commands: [] };
  const [tvdbSeries, tvdbEpisodes] = resolvedTvdbId
    ? await Promise.all([
        getTvdbSeriesSummary(config, resolvedTvdbId),
        getTvdbSeriesEpisodes(config, resolvedTvdbId)
      ])
    : [null, []];
  const hasUsableTvdbEpisodes = tvdbEpisodes.some((episode) => typeof episode.seasonNumber === 'number' && episode.seasonNumber > 0);
  const title = seriesItem?.Name || String(tmdbSeries?.name || '') || tvdbSeries?.name || primaryItem?.Name || card.title;
  const overview = seriesItem?.Overview || String(tmdbSeries?.overview || '') || tvdbSeries?.overview || primaryItem?.Overview || card.overview;
  const seasonDescriptors = buildSeriesSeasonDescriptors(
    tmdbSeries,
    jellyfinSeasons,
    sonarrContext.episodes,
    hasUsableTvdbEpisodes ? tvdbSeries : null,
    hasUsableTvdbEpisodes ? tvdbEpisodes : []
  );
  const selectedSeason = chooseSelectedSeason(seasonDescriptors, seasonId, item, nextEpisode);
  const episodeGroups = await Promise.all(
    seasonDescriptors.map((season) => buildSeasonEpisodes(
      config,
      tmdbId,
      season,
      seriesItem?.Id,
      Boolean(sonarrSeries?.id),
      sonarrContext.episodes,
      sonarrContext.queue,
      sonarrContext.commands,
      hasUsableTvdbEpisodes ? tvdbEpisodes : []
    ))
  );
  const episodes = episodeGroups.flat();
  const seasons = buildTitleSeasons(seasonDescriptors, episodes, sonarrContext.episodes, sonarrContext.queue, sonarrContext.commands);

  const resolvedNextEpisode = nextEpisode && episodes.some((episode) => episode.id === nextEpisode.id)
    ? episodes.find((episode) => episode.id === nextEpisode.id) || nextEpisode
    : nextEpisode;

  return {
    id: card.id,
    tmdbId,
    providerId: seriesItem?.Id || card.providerId,
    sonarrSeriesId: sonarrSeries?.id,
    playTargetId: resolvedNextEpisode?.id || seriesItem?.Id,
    availableInJellyfin: Boolean(seriesItem?.Id),
    title,
    overview,
    subtitle,
    mediaType: 'series',
    posterUrl,
    backdropUrl: effectiveBackdropUrl,
    logoUrl: logoUrl || card.logoUrl,
    selectedSeasonId: selectedSeason?.id,
    seasons,
    episodes,
    cast: buildTitleCast(tmdbSeries, 'series')
  };
}

function buildTitleCast(
  tmdbPayload: Record<string, unknown> | null,
  mediaType: 'movie' | 'series'
): TitleDetailsCastMember[] {
  const creditsKey = mediaType === 'series' ? 'aggregate_credits' : 'credits';
  const castEntries = asArray(asRecord(tmdbPayload?.[creditsKey])?.cast)
    .map((entry) => asRecord(entry))
    .slice(0, 20);

  return castEntries.map((entry) => ({
    id: String(entry.id || ''),
    name: String(entry.name || ''),
    role: String(
      entry.character
      || asArray(entry.roles).map((role) => String(asRecord(role).character || '')).find(Boolean)
      || entry.known_for_department
      || ''
    ),
    imageUrl: typeof entry.profile_path === 'string' && entry.profile_path
      ? `${TMDB_IMAGE}/w342${entry.profile_path}`
      : ''
  })).filter((member) => Boolean(member.id && member.name));
}

async function getTmdbMovieSummary(config: AppConfig, tmdbId: number): Promise<Record<string, unknown> | null> {
  return tmdbFetch(
    config,
    `/movie/${tmdbId}?append_to_response=credits,images&language=${encodeURIComponent(config.preferences.language)}`
  );
}

async function enrichDownloadItem(
  config: AppConfig,
  item: DownloadItem,
  metadataCache: Map<string, Promise<Partial<DownloadItem>>>
): Promise<DownloadItem> {
  if (item.tmdbId && item.backdropUrl) {
    return item;
  }

  if (item.tmdbId) {
    const cacheKey = `${item.mediaType === 'movie' ? 'movie' : 'tv'}:tmdb:${item.tmdbId}`;
    let metadataPromise = metadataCache.get(cacheKey);
    if (!metadataPromise) {
      metadataPromise = findDownloadMetadataByTmdbId(config, item.tmdbId, item.mediaType === 'movie' ? 'movie' : 'tv');
      metadataCache.set(cacheKey, metadataPromise);
    }
    const metadata = await metadataPromise;
    return {
      ...item,
      ...metadata,
      posterUrl: item.posterUrl || metadata.posterUrl,
      backdropUrl: item.backdropUrl || metadata.backdropUrl,
      subtitle: item.subtitle || metadata.subtitle
    };
  }

  const hint = inferDownloadHint(item.detail || item.title);
  if (!hint.query) {
    return item;
  }

  const cacheKey = `${hint.mediaType}:${hint.query}`;
  let metadataPromise = metadataCache.get(cacheKey);
  if (!metadataPromise) {
    metadataPromise = findDownloadMetadata(config, hint);
    metadataCache.set(cacheKey, metadataPromise);
  }

  return {
    ...item,
    ...(await metadataPromise)
  };
}

async function findDownloadMetadataByTmdbId(
  config: AppConfig,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<Partial<DownloadItem>> {
  try {
    const response = await tmdbFetch(
      config,
      `/${mediaType}/${tmdbId}?language=${encodeURIComponent(config.preferences.language)}`
    );
    if (!response) {
      return {};
    }
    const card = tmdbToCard(response, mediaType);
    const englishBackdropUrl = await getTmdbHighResBackdrop(config, tmdbId, mediaType, 'en', card.originalLanguage);
    return {
      title: card.title,
      posterUrl: card.posterUrl,
      backdropUrl: englishBackdropUrl || card.backdropUrl,
      tmdbId: card.tmdbId,
      mediaType: mediaType === 'tv' ? 'series' : 'movie'
    };
  } catch {
    return {};
  }
}

async function findDownloadMetadata(
  config: AppConfig,
  hint: DownloadMetadataHint
): Promise<Partial<DownloadItem>> {
  try {
    const response = await tmdbFetch(
      config,
      `/search/${hint.mediaType}?query=${encodeURIComponent(hint.query)}&language=${encodeURIComponent(config.preferences.language)}`
    );
    const match = asArray(response?.results)
      .map((entry) => asRecord(entry))
      .find((entry) => entry.id);
    if (!match) {
      return {};
    }

    const card = tmdbToCard(match, hint.mediaType);
    const englishBackdropUrl = card.tmdbId
      ? await getTmdbHighResBackdrop(config, card.tmdbId, hint.mediaType, 'en', card.originalLanguage)
      : '';
    return {
      title: card.title,
      posterUrl: card.posterUrl,
      backdropUrl: englishBackdropUrl || card.backdropUrl,
      tmdbId: card.tmdbId,
      mediaType: hint.mediaType === 'tv' ? 'series' : 'movie',
      subtitle: hint.subtitle
    };
  } catch {
    return {};
  }
}

function inferDownloadHint(rawTitle: string): DownloadMetadataHint {
  const scope = inferDownloadScope(rawTitle);
  const cleaned = rawTitle
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*]/g, ' ')
    .replace(/[._]/g, ' ')
    .replace(/\b(2160p|1080p|720p|480p|x264|x265|h\.?264|h\.?265|hevc|hdr10\+?|aac2?\.?0|ddp\d?\.?\d?|atmos|web[- ]?dl|webrip|bluray|bdremux|remux|multi[- ]subs?|dual[- ]audio|repack|proper|complete|extras)\b/gi, ' ')
    .replace(/\b(S\d{1,2}E\d{1,3}|E\d{1,3}|EP\d{1,3}|Season\s+\d+|Part\s+\d+)\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    query: cleaned || rawTitle,
    mediaType: scope.mediaType,
    subtitle: scope.scopeLabel
  };
}

function formatEpisodeSubtitle(
  episode: { seasonNumber?: number; episodeNumber?: number; title?: string } | undefined,
  rawTitle: string | undefined
): string {
  const seasonNumber = episode?.seasonNumber;
  const episodeNumber = episode?.episodeNumber;
  const seasonEpisodeLabel = seasonNumber && episodeNumber
    ? `Season ${seasonNumber}, Episode ${episodeNumber}`
    : extractSeasonEpisodeLabel(rawTitle || '');
  return [seasonEpisodeLabel, episode?.title].filter(Boolean).join(' · ') || 'Episode';
}

function extractSeasonEpisodeLabel(rawTitle: string): string {
  const seasonEpisodeMatch = rawTitle.match(/\bS(\d{1,2})E(\d{1,3})\b/i);
  if (seasonEpisodeMatch) {
    return `Season ${Number(seasonEpisodeMatch[1])}, Episode ${Number(seasonEpisodeMatch[2])}`;
  }

  const episodeMatch = rawTitle.match(/\bEP?(\d{1,3})\b/i);
  if (episodeMatch) {
    return `Episode ${Number(episodeMatch[1])}`;
  }

  return '';
}

function inferDownloadScope(rawTitle: string): { scopeLabel: string; mediaType: 'movie' | 'tv' } {
  if (/\bS\d{1,2}E\d{1,3}\b/i.test(rawTitle) || /\bEP?\d{1,3}\b/i.test(rawTitle)) {
    return { scopeLabel: 'Episode', mediaType: 'tv' };
  }
  if (/\bcomplete\b|\bcollection\b|\bseasons?\s*\d+\s*-\s*\d+\b/i.test(rawTitle)) {
    return { scopeLabel: 'Series', mediaType: 'tv' };
  }
  if (/\bSeason\s+\d+\b/i.test(rawTitle) || /\bS\d{1,2}\b/i.test(rawTitle)) {
    return { scopeLabel: 'Season', mediaType: 'tv' };
  }
  return { scopeLabel: 'Movie', mediaType: 'movie' };
}

function extractRemoteImage(
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>
): string | undefined {
  const poster = images?.find((image) => image.coverType === 'poster');
  return poster?.remoteUrl || poster?.url || undefined;
}

function mapSonarrCalendarEntry(item: SonarrCalendarRecord): CalendarEntry | null {
  const startsAt = item.airDateUtc || item.airDate
  const seriesTitle = item.series?.title || ''
  const tmdbId = Number(item.series?.tmdbId) || undefined

  if (!startsAt || !seriesTitle) {
    return null
  }

  const seasonNumber = typeof item.seasonNumber === 'number' ? item.seasonNumber : undefined
  const episodeNumber = typeof item.episodeNumber === 'number' ? item.episodeNumber : undefined
  const detail = item.title || ''
  const subtitle = [
    typeof seasonNumber === 'number' ? `Season ${seasonNumber}` : '',
    typeof episodeNumber === 'number' ? `Episode ${episodeNumber}` : '',
  ].filter(Boolean).join(' · ')

  return {
    id: `sonarr-calendar-${item.id || `${seriesTitle}-${startsAt}`}`,
    source: 'sonarr',
    kind: 'episode',
    startsAt,
    title: seriesTitle,
    subtitle: subtitle || 'Upcoming episode',
    detail: detail || 'Upcoming episode',
    imageUrl: extractRemoteImage(item.series?.images),
    stateLabel: item.hasFile ? 'Available' : item.monitored ? 'Upcoming' : 'Unmonitored',
    card: {
      id: `calendar-series-${tmdbId || item.id || seriesTitle}`,
      tmdbId,
      title: seriesTitle,
      subtitle: subtitle || detail || 'Series',
      overview: item.overview || '',
      mediaType: 'series',
      posterUrl: extractRemoteImage(item.series?.images) || '',
      backdropUrl: extractRemoteImage(item.series?.images) || '',
      badge: 'Sonarr',
      actionLabel: 'Series details',
      releaseDate: item.airDate,
      firstAirDate: item.airDate,
      mediaStatus: item.series?.status,
    }
  }
}

function mapRadarrCalendarEntry(item: RadarrCalendarRecord): CalendarEntry | null {
  const startsAt = item.physicalRelease || item.digitalRelease || item.inCinemas
  if (!startsAt || !item.title) {
    return null
  }

  const posterUrl = extractRemoteImage(item.images) || ''
  const releaseLabel = item.physicalRelease
    ? 'Digital release'
    : item.inCinemas
      ? 'In cinemas'
      : 'Release'

  return {
    id: `radarr-calendar-${item.id || `${item.title}-${startsAt}`}`,
    source: 'radarr',
    kind: 'movie',
    startsAt,
    title: item.title,
    subtitle: item.year ? String(item.year) : 'Movie',
    detail: releaseLabel,
    imageUrl: posterUrl,
    stateLabel: item.hasFile ? 'Available' : item.monitored ? 'Upcoming' : 'Unmonitored',
    card: {
      id: `calendar-movie-${item.tmdbId || item.id || item.title}`,
      tmdbId: Number(item.tmdbId) || undefined,
      title: item.title,
      subtitle: item.year ? String(item.year) : 'Movie',
      overview: item.overview || '',
      mediaType: 'movie',
      posterUrl,
      backdropUrl: posterUrl,
      badge: 'Radarr',
      actionLabel: 'Movie details',
      releaseDate: startsAt,
      mediaStatus: item.status,
    }
  }
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

async function getJellyfinItemDetails(config: AppConfig, itemId: string): Promise<JellyfinItem | null> {
  if (!config.jellyfin.baseUrl || !config.jellyfin.apiKey || !config.jellyfin.userId) {
    return null;
  }

  try {
    return await jellyfinFetch<JellyfinItem>(
      config,
      `/Users/${config.jellyfin.userId}/Items/${encodeURIComponent(itemId)}?fields=ProviderIds,Overview,ImageTags,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber,ProductionYear,SeriesId,SeriesName,PremiereDate,ChildCount`
    );
  } catch {
    return null;
  }
}

async function resolveSeriesItem(
  config: AppConfig,
  card: MediaCard,
  item: JellyfinItem | null
): Promise<JellyfinItem | null> {
  if (item?.Type === 'Series') {
    return item;
  }

  const seriesId = item?.SeriesId || (card.mediaType === 'series' || card.mediaType === 'tv' ? card.providerId : '');
  if (!seriesId) {
    return null;
  }

  return getJellyfinItemDetails(config, seriesId);
}

function buildJellyfinAssetUrl(itemId: string, kind: string, maxWidth: number, tag: string): string {
  return `/api/assets/jellyfin/${itemId}?kind=${encodeURIComponent(kind)}&maxWidth=${maxWidth}&tag=${encodeURIComponent(tag)}`;
}

function resolvePrimaryPoster(item: JellyfinItem | null, card: MediaCard): string {
  if (item?.Id) {
    const posterTag = item.ImageTags?.Primary || '';
    return buildJellyfinAssetUrl(item.Id, 'Primary', 640, posterTag);
  }

  return card.posterUrl;
}

function resolveBackdrop(item: JellyfinItem | null, card: MediaCard): string {
  if (item?.Id) {
    const backdropItemId = item.ParentBackdropItemId || item.Id;
    const backdropTag = item.ParentBackdropImageTags?.[0] || item.BackdropImageTags?.[0] || item.ImageTags?.Primary || '';
    return buildJellyfinAssetUrl(backdropItemId, 'Backdrop', 1920, backdropTag);
  }

  return card.backdropUrl || card.posterUrl;
}

function buildTitleSubtitle(item: JellyfinItem | null, card: MediaCard): string {
  if (!item) {
    return card.subtitle;
  }

  if (item.Type === 'Movie') {
    return item.ProductionYear ? String(item.ProductionYear) : card.subtitle;
  }

  if (item.Type === 'Series') {
    return item.ProductionYear ? String(item.ProductionYear) : card.subtitle;
  }

  if (item.Type === 'Episode') {
    return [item.SeriesName, formatEpisodeCode(item.ParentIndexNumber, item.IndexNumber)].filter(Boolean).join(' · ') || card.subtitle;
  }

  return card.subtitle;
}

async function getPreferredTitleLogo(
  config: AppConfig,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<string> {
  const logos = await getTmdbLogos(config, tmdbId, mediaType);
  const englishLogo = logos.find((logo) => logo.iso_639_1 === 'en' || logo.iso_639_1 === 'en-US');
  const noLanguageLogo = logos.find((logo) => logo.iso_639_1 == null);
  const selectedLogo = englishLogo || noLanguageLogo || logos[0];
  return selectedLogo?.file_path ? `${TMDB_IMAGE}/original${selectedLogo.file_path}` : '';
}

async function getTmdbSeriesSummary(config: AppConfig, tmdbId: number): Promise<Record<string, unknown> | null> {
  return tmdbFetch(
    config,
    `/tv/${tmdbId}?append_to_response=external_ids,aggregate_credits&language=${encodeURIComponent(config.preferences.language)}`
  );
}

async function resolveTmdbSeriesIdByTvdbId(config: AppConfig, tvdbId?: number): Promise<number | undefined> {
  if (!tvdbId) {
    return undefined;
  }

  try {
    const response = await tmdbFetch(
      config,
      `/find/${encodeURIComponent(String(tvdbId))}?external_source=tvdb_id`
    );
    const firstMatch = asArray(response?.tv_results)[0];
    const id = Number(asRecord(firstMatch).id || 0);
    return id || undefined;
  } catch {
    return undefined;
  }
}

function resolveTvdbImageUrl(image: string | undefined): string {
  if (!image) {
    return '';
  }

  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }

  return `https://artworks.thetvdb.com${image.startsWith('/') ? image : `/${image}`}`;
}

function getTvdbTranslationCandidates(config: AppConfig): string[] {
  const preferred = String(config.preferences.language || '').trim().toLowerCase();
  if (preferred.startsWith('en')) {
    return ['eng', 'en'];
  }

  return [];
}

function hasLikelyJapaneseText(value: string | undefined): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(String(value || ''));
}

async function getTvdbTranslation(
  config: AppConfig,
  entity: 'episodes' | 'series',
  id: number
): Promise<TvdbTranslationRecord | null> {
  const candidates = getTvdbTranslationCandidates(config);
  for (const language of candidates) {
    for (const path of [
      `/${entity}/${encodeURIComponent(String(id))}/translations/${encodeURIComponent(language)}`,
      `/${entity}/${encodeURIComponent(String(id))}/translations/${encodeURIComponent(language)}/overview`
    ]) {
      const response = await tvdbFetch(config, path);
      const data = asRecord(response?.data);
      const translation = asRecord(data.translation || data);
      const name = typeof translation.name === 'string'
        ? translation.name
        : typeof data.name === 'string'
          ? data.name
          : undefined;
      const overview = typeof translation.overview === 'string'
        ? translation.overview
        : typeof data.overview === 'string'
          ? data.overview
          : undefined;

      if (name || overview) {
        return { name, overview };
      }
    }
  }

  return null;
}

async function applyTvdbEpisodeTranslations(
  config: AppConfig,
  episodes: TvdbEpisodeRecord[]
): Promise<TvdbEpisodeRecord[]> {
  const candidates = getTvdbTranslationCandidates(config);
  if (!candidates.length) {
    return episodes;
  }

  return Promise.all(
    episodes.map(async (episode) => {
      if (!episode.id || (!hasLikelyJapaneseText(episode.name) && !hasLikelyJapaneseText(episode.overview))) {
        return episode;
      }

      const translation = await getTvdbTranslation(config, 'episodes', episode.id);
      return translation
        ? {
            ...episode,
            name: translation.name || episode.name,
            overview: translation.overview || episode.overview
          }
        : episode;
    })
  );
}

async function getTvdbSeriesSummary(config: AppConfig, tvdbId: number): Promise<TvdbSeriesRecord | null> {
  const response = await tvdbFetch(config, `/series/${encodeURIComponent(String(tvdbId))}/extended`);
  const data = asRecord(response?.data);
  if (!data.id) {
    return null;
  }

  return {
    id: Number(data.id || 0) || undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    overview: typeof data.overview === 'string' ? data.overview : undefined,
    image: typeof data.image === 'string' ? data.image : undefined,
    artworks: asArray(data.artworks).map((entry) => {
      const artwork = asRecord(entry);
      return {
        image: typeof artwork.image === 'string' ? artwork.image : undefined,
        type: Number(artwork.type || 0) || undefined
      };
    }),
    seasons: asArray(data.seasons).map((entry) => {
      const season = asRecord(entry);
      const type = asRecord(season.type);
      return {
        id: Number(season.id || 0) || undefined,
        number: Number(season.number || 0) || undefined,
        image: typeof season.image === 'string' ? season.image : undefined,
        name: typeof season.name === 'string' ? season.name : undefined,
        type: {
          name: typeof type.name === 'string' ? type.name : undefined,
          type: typeof type.type === 'string' ? type.type : undefined
        }
      };
    })
  };
}

async function getTvdbSeriesEpisodes(config: AppConfig, tvdbId: number): Promise<TvdbEpisodeRecord[]> {
  const episodes: TvdbEpisodeRecord[] = [];
  let page = 0;

  while (page < 20) {
    const response = await tvdbFetch(
      config,
      `/series/${encodeURIComponent(String(tvdbId))}/episodes/default?page=${page}`
    );
    const data = asRecord(response?.data);
    const currentBatch = asArray(data.episodes).length
      ? asArray(data.episodes)
      : asArray(response?.data);

    const parsed = currentBatch
      .map((entry) => asRecord(entry))
      .map((episode) => ({
        id: Number(episode.id || 0) || undefined,
        name: typeof episode.name === 'string' ? episode.name : undefined,
        overview: typeof episode.overview === 'string' ? episode.overview : undefined,
        image: typeof episode.image === 'string' ? episode.image : undefined,
        aired: typeof episode.aired === 'string' ? episode.aired : undefined,
        seasonNumber: Number(episode.seasonNumber || 0) || undefined,
        number: Number(episode.number || 0) || undefined,
        runtime: Number(episode.runtime || 0) || undefined
      } satisfies TvdbEpisodeRecord))
      .filter((episode) => typeof episode.seasonNumber === 'number' && typeof episode.number === 'number');

    episodes.push(...parsed);

    const links = asRecord(response?.links);
    const next = Number(links.next || 0);
    if (!parsed.length || !next || next === page) {
      break;
    }

    page = next;
  }

  return applyTvdbEpisodeTranslations(config, episodes);
}

async function getJellyfinSeriesSeasons(config: AppConfig, seriesId: string): Promise<SeriesSeasonDescriptor[]> {
  try {
    const seasons = await jellyfinFetch<JellyfinItem[]>(
      config,
      `/Users/${encodeURIComponent(config.jellyfin.userId)}/Items?parentId=${encodeURIComponent(seriesId)}&includeItemTypes=Season&fields=Overview,ImageTags,IndexNumber,ChildCount&sortBy=SortName`
    );

    return seasons
      .filter((season) => season.Id)
      .map((season) => ({
        id: buildSeasonId(typeof season.IndexNumber === 'number' ? season.IndexNumber : undefined, String(season.Id)),
        title: season.Name || (typeof season.IndexNumber === 'number' ? `Season ${season.IndexNumber}` : 'Season'),
        seasonNumber: typeof season.IndexNumber === 'number' ? season.IndexNumber : undefined,
        episodeCount: typeof season.ChildCount === 'number' ? season.ChildCount : undefined,
        jellyfinSeasonId: String(season.Id)
      }))
      .sort(sortSeasonDescriptors);
  } catch {
    return [];
  }
}

function chooseSelectedSeason(
  seasons: SeriesSeasonDescriptor[],
  requestedSeasonId: string | undefined,
  item: JellyfinItem | null,
  nextEpisode?: TitleDetailsEpisode | null
): SeriesSeasonDescriptor | undefined {
  if (requestedSeasonId) {
    const requestedSeason = seasons.find((season) => season.id === requestedSeasonId);
    if (requestedSeason) {
      return requestedSeason;
    }
  }

  if (typeof nextEpisode?.seasonNumber === 'number') {
    const matchingSeason = seasons.find((season) => season.seasonNumber === nextEpisode.seasonNumber);
    if (matchingSeason) {
      return matchingSeason;
    }
  }

  if (item?.Type === 'Episode' && typeof item.ParentIndexNumber === 'number') {
    const matchingSeason = seasons.find((season) => season.seasonNumber === item.ParentIndexNumber);
    if (matchingSeason) {
      return matchingSeason;
    }
  }

  return seasons.find((season) => season.seasonNumber && season.seasonNumber > 0) || seasons[0];
}

async function getJellyfinSeasonEpisodes(
  config: AppConfig,
  seriesId: string,
  seasonId: string
): Promise<TitleDetailsEpisode[]> {
  try {
    const episodes = await jellyfinFetch<JellyfinItem[]>(
      config,
      `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${encodeURIComponent(config.jellyfin.userId)}&seasonId=${encodeURIComponent(seasonId)}&enableUserData=true&fields=Overview,ImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber,PremiereDate&sortBy=SortName`
    );

    return episodes
      .filter((episode) => episode.Id)
      .sort((left, right) => (left.IndexNumber ?? 0) - (right.IndexNumber ?? 0))
      .map(mapJellyfinEpisode);
  } catch {
    return [];
  }
}

async function getTmdbSeasonEpisodes(
  config: AppConfig,
  tmdbId: number,
  seasonNumber: number
): Promise<TmdbEpisodeRecord[]> {
  const response = await tmdbFetch(
    config,
    `/tv/${tmdbId}/season/${seasonNumber}`
  );

  return asArray(response?.episodes)
    .map((entry) => asRecord(entry))
    .map((episode) => ({
      episode_number: Number(episode.episode_number || 0) || undefined,
      name: typeof episode.name === 'string' ? episode.name : undefined,
      overview: typeof episode.overview === 'string' ? episode.overview : undefined,
      still_path: typeof episode.still_path === 'string' ? episode.still_path : episode.still_path === null ? null : undefined,
      air_date: typeof episode.air_date === 'string' ? episode.air_date : undefined,
      runtime: Number(episode.runtime || 0) || undefined
    }));
}

async function getSonarrSeriesRecord(
  config: AppConfig,
  tvdbId: number,
  tmdbId?: number
): Promise<SonarrSeriesRecord | null> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey || !tvdbId) {
    return null;
  }

  const response = await fetchJson<SonarrSeriesRecord[]>(
    `${config.sonarr.baseUrl}/api/v3/series?tvdbId=${encodeURIComponent(String(tvdbId))}`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );

  return response.find((series) => series.id && (!tmdbId || !series.tmdbId || series.tmdbId === tmdbId)) || response[0] || null;
}

async function getSonarrSeriesById(config: AppConfig, seriesId: number): Promise<SonarrSeriesRecord | null> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey || !seriesId) {
    return null;
  }

  return fetchJson<SonarrSeriesRecord>(
    `${config.sonarr.baseUrl}/api/v3/series/${encodeURIComponent(String(seriesId))}`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );
}

async function getSonarrEpisodesBySeriesId(config: AppConfig, seriesId: number): Promise<SonarrEpisodeRecord[]> {
  return fetchJson<SonarrEpisodeRecord[]>(
    `${config.sonarr.baseUrl}/api/v3/episode?seriesId=${encodeURIComponent(String(seriesId))}`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );
}

async function getSonarrEpisodeFilesBySeriesId(config: AppConfig, seriesId: number): Promise<SonarrEpisodeFileRecord[]> {
  return fetchJson<SonarrEpisodeFileRecord[]>(
    `${config.sonarr.baseUrl}/api/v3/episodefile?seriesId=${encodeURIComponent(String(seriesId))}`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  );
}

async function getSonarrSeriesContext(
  config: AppConfig,
  seriesId: number
): Promise<{ episodes: SonarrEpisodeRecord[]; queue: SonarrQueueRecord[]; commands: SonarrCommandRecord[] }> {
  const [episodes, queue, commands] = await Promise.all([
    getSonarrEpisodesBySeriesId(config, seriesId),
    getSonarrQueue(config),
    getSonarrCommands(config)
  ]);
  const seriesEpisodeIds = new Set(
    episodes
      .map((episode) => episode.id)
      .filter((id): id is number => typeof id === 'number')
  );

  return {
    episodes,
    queue: queue.filter((entry) => entry.seriesId === seriesId),
    commands: commands.filter((command) => {
      if (command.body?.seriesId === seriesId) {
        return true;
      }

      const episodeIds = Array.isArray(command.body?.episodeIds) ? command.body.episodeIds : [];
      return episodeIds.some((episodeId) => seriesEpisodeIds.has(episodeId));
    })
  };
}

async function getSonarrCommands(config: AppConfig): Promise<SonarrCommandRecord[]> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return [];
  }

  try {
    return await fetchJson<SonarrCommandRecord[]>(
      `${config.sonarr.baseUrl}/api/v3/command`,
      {
        headers: {
          'X-Api-Key': config.sonarr.apiKey
        }
      }
    );
  } catch {
    return [];
  }
}

async function getRadarrCommands(config: AppConfig): Promise<RadarrCommandRecord[]> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    return [];
  }

  try {
    return await fetchJson<RadarrCommandRecord[]>(
      `${config.radarr.baseUrl}/api/v3/command`,
      {
        headers: {
          'X-Api-Key': config.radarr.apiKey
        }
      }
    );
  } catch {
    return [];
  }
}

async function getRadarrMovieRecord(config: AppConfig, tmdbId: number): Promise<RadarrMovieRecord | null> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey || !tmdbId) {
    return null;
  }

  const requestInit = {
    headers: {
      'X-Api-Key': config.radarr.apiKey
    }
  };

  try {
    const response = await fetchJson<unknown>(
      `${config.radarr.baseUrl}/api/v3/movie?tmdbId=${encodeURIComponent(String(tmdbId))}`,
      requestInit
    );
    const directMatches = asArray(response) as RadarrMovieRecord[];
    const directMovie = directMatches.find((movie) => Number(movie.tmdbId || 0) === tmdbId);
    if (directMovie) {
      return directMovie;
    }

    const singleMovie = asRecord(response) as RadarrMovieRecord;
    if (Number(singleMovie.tmdbId || 0) === tmdbId) {
      return singleMovie;
    }
  } catch {
    // Older Radarr versions may not support filtering by tmdbId.
  }

  try {
    const response = await fetchJson<RadarrMovieRecord[]>(
      `${config.radarr.baseUrl}/api/v3/movie`,
      requestInit
    );
    return response.find((movie) => Number(movie.tmdbId || 0) === tmdbId) || null;
  } catch {
    return null;
  }
}

async function resolveSonarrRequestConfig(config: AppConfig): Promise<{
  rootFolderPath: string;
  qualityProfileId: number;
  languageProfileId: number;
}> {
  const rootFolderPath = config.sonarr.rootFolderPath || (await getSonarrRootFolders(config))[0]?.id || '';
  const qualityProfileId = config.sonarr.qualityProfileId || Number((await getSonarrQualityProfiles(config))[0]?.id || 0);
  const languageProfileId = config.sonarr.languageProfileId || Number((await getSonarrLanguageProfiles(config))[0]?.id || 0);

  if (!rootFolderPath) {
    throw new Error('Sonarr root folder is not configured.');
  }
  if (!qualityProfileId) {
    throw new Error('Sonarr quality profile is not configured.');
  }
  if (!languageProfileId) {
    throw new Error('Sonarr language profile is not configured.');
  }

  return {
    rootFolderPath,
    qualityProfileId,
    languageProfileId
  };
}

async function resolveRadarrRequestConfig(config: AppConfig): Promise<{
  rootFolderPath: string;
  qualityProfileId: number;
}> {
  const rootFolderPath = config.radarr.rootFolderPath || (await getRadarrRootFolders(config))[0]?.id || '';
  const qualityProfileId = config.radarr.qualityProfileId || Number((await getRadarrQualityProfiles(config))[0]?.id || 0);

  if (!rootFolderPath) {
    throw new Error('Radarr root folder is not configured.');
  }
  if (!qualityProfileId) {
    throw new Error('Radarr quality profile is not configured.');
  }

  return {
    rootFolderPath,
    qualityProfileId
  };
}

function buildSeriesSeasonDescriptors(
  tmdbSeries: Record<string, unknown> | null,
  jellyfinSeasons: SeriesSeasonDescriptor[],
  sonarrEpisodes: SonarrEpisodeRecord[],
  tvdbSeries: TvdbSeriesRecord | null,
  tvdbEpisodes: TvdbEpisodeRecord[]
): SeriesSeasonDescriptor[] {
  const jellyfinBySeasonNumber = new Map(
    jellyfinSeasons
      .filter((season) => typeof season.seasonNumber === 'number')
      .map((season) => [season.seasonNumber as number, season] as const)
  );
  const sonarrEpisodeCountBySeasonNumber = new Map<number, number>();
  for (const episode of sonarrEpisodes) {
    if (typeof episode.seasonNumber !== 'number' || typeof episode.episodeNumber !== 'number' || episode.seasonNumber < 0) {
      continue;
    }

    sonarrEpisodeCountBySeasonNumber.set(
      episode.seasonNumber,
      (sonarrEpisodeCountBySeasonNumber.get(episode.seasonNumber) || 0) + 1
    );
  }

  const tvdbEpisodeCountBySeasonNumber = new Map<number, number>();
  for (const episode of tvdbEpisodes) {
    if (typeof episode.seasonNumber !== 'number' || typeof episode.number !== 'number' || episode.seasonNumber < 0) {
      continue;
    }

    tvdbEpisodeCountBySeasonNumber.set(
      episode.seasonNumber,
      (tvdbEpisodeCountBySeasonNumber.get(episode.seasonNumber) || 0) + 1
    );
  }

  const tvdbSeasonBySeasonNumber = new Map(
    asArray(tvdbSeries?.seasons)
      .map((entry) => entry as NonNullable<TvdbSeriesRecord['seasons']>[number])
      .filter((season) => typeof season.number === 'number' && season.number >= 0)
      .map((season) => [season.number as number, season] as const)
  );

  const seasonNumbers = new Set<number>([
    ...tvdbEpisodeCountBySeasonNumber.keys(),
    ...tvdbSeasonBySeasonNumber.keys(),
    ...jellyfinBySeasonNumber.keys(),
    ...sonarrEpisodeCountBySeasonNumber.keys()
  ]);

  if (seasonNumbers.size) {
    return [...seasonNumbers]
      .sort((left, right) => sortSeasonDescriptors({ seasonNumber: left }, { seasonNumber: right }))
      .map((seasonNumber) => {
        const jellyfinSeason = jellyfinBySeasonNumber.get(seasonNumber);
        const tvdbSeason = tvdbSeasonBySeasonNumber.get(seasonNumber);

        return {
          id: buildSeasonId(seasonNumber),
          title: seasonNumber === 0
            ? jellyfinSeason?.title || tvdbSeason?.name || 'Specials'
            : jellyfinSeason?.title || tvdbSeason?.name || `Season ${seasonNumber}`,
          seasonNumber,
          episodeCount: tvdbEpisodeCountBySeasonNumber.get(seasonNumber)
            ?? sonarrEpisodeCountBySeasonNumber.get(seasonNumber)
            ?? jellyfinSeason?.episodeCount,
          jellyfinSeasonId: jellyfinSeason?.jellyfinSeasonId
        };
      })
      .filter((season) => (season.episodeCount ?? 0) > 0);
  }

  const tmdbSeasons = asArray(tmdbSeries?.seasons)
    .map((entry) => asRecord(entry))
    .map((season) => ({
      seasonNumber: Number(season.season_number || 0),
      name: typeof season.name === 'string' ? season.name : '',
      episodeCount: Number(season.episode_count || 0) || undefined
    } satisfies TmdbSeasonSummary))
    .filter((season) => Number.isFinite(season.seasonNumber) && season.seasonNumber >= 0);

  if (tmdbSeasons.length) {
    return tmdbSeasons
      .filter((season) => {
        const jellyfinSeason = jellyfinBySeasonNumber.get(season.seasonNumber);
        return (season.episodeCount ?? jellyfinSeason?.episodeCount ?? 0) > 0;
      })
      .map((season) => {
        const jellyfinSeason = jellyfinBySeasonNumber.get(season.seasonNumber);
        return {
          id: buildSeasonId(season.seasonNumber),
          title: season.seasonNumber === 0
            ? jellyfinSeason?.title || season.name || 'Specials'
            : season.name || `Season ${season.seasonNumber}`,
          seasonNumber: season.seasonNumber,
          episodeCount: season.episodeCount ?? jellyfinSeason?.episodeCount,
          jellyfinSeasonId: jellyfinSeason?.jellyfinSeasonId
        };
      })
      .sort(sortSeasonDescriptors);
  }

  return jellyfinSeasons
    .filter((season) => (season.episodeCount ?? 0) > 0)
    .sort(sortSeasonDescriptors);
}

function normalizeEpisodeTitle(value: string | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(part|episode|ep)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEpisodeDate(value: string | undefined): string {
  return String(value || '').slice(0, 10);
}

function matchJellyfinEpisode(
  jellyfinEpisodes: TitleDetailsEpisode[],
  episodeNumber: number,
  preferredTitle: string | undefined,
  preferredAirDate: string | undefined
): TitleDetailsEpisode | undefined {
  const normalizedPreferredTitle = normalizeEpisodeTitle(preferredTitle);
  const normalizedPreferredDate = normalizeEpisodeDate(preferredAirDate);

  if (normalizedPreferredTitle) {
    const exactTitleMatch = jellyfinEpisodes.find((episode) => normalizeEpisodeTitle(episode.title) === normalizedPreferredTitle);
    if (exactTitleMatch) {
      return exactTitleMatch;
    }
  }

  if (normalizedPreferredDate) {
    const dateMatch = jellyfinEpisodes.find((episode) => normalizeEpisodeDate(episode.airDate) === normalizedPreferredDate);
    if (dateMatch) {
      return dateMatch;
    }
  }

  return jellyfinEpisodes.find((episode) => episode.episodeNumber === episodeNumber);
}

async function buildSeasonEpisodes(
  config: AppConfig,
  tmdbId: number | undefined,
  season: SeriesSeasonDescriptor,
  jellyfinSeriesId: string | undefined,
  isManagedInSonarr: boolean,
  sonarrEpisodes: SonarrEpisodeRecord[],
  sonarrQueue: SonarrQueueRecord[],
  sonarrCommands: SonarrCommandRecord[],
  tvdbEpisodes: TvdbEpisodeRecord[]
): Promise<TitleDetailsEpisode[]> {
  const seasonNumber = season.seasonNumber;
  const [tmdbEpisodes, jellyfinEpisodes] = await Promise.all([
    tmdbId && typeof seasonNumber === 'number'
      ? getTmdbSeasonEpisodes(config, tmdbId, seasonNumber)
      : Promise.resolve([]),
    jellyfinSeriesId && season.jellyfinSeasonId
      ? getJellyfinSeasonEpisodes(config, jellyfinSeriesId, season.jellyfinSeasonId)
      : Promise.resolve([])
  ]);
  const tmdbByEpisodeNumber = new Map(
    tmdbEpisodes
      .filter((episode) => typeof episode.episode_number === 'number')
      .map((episode) => [episode.episode_number as number, episode] as const)
  );
  const jellyfinByEpisodeNumber = new Map(
    jellyfinEpisodes
      .filter((episode) => typeof episode.episodeNumber === 'number')
      .map((episode) => [episode.episodeNumber as number, episode] as const)
  );
  const sonarrByEpisodeNumber = new Map(
    sonarrEpisodes
      .filter((episode) => episode.seasonNumber === seasonNumber && typeof episode.episodeNumber === 'number')
      .map((episode) => [episode.episodeNumber as number, episode] as const)
  );
  const tvdbByEpisodeNumber = new Map(
    tvdbEpisodes
      .filter((episode) => episode.seasonNumber === seasonNumber && typeof episode.number === 'number')
      .map((episode) => [episode.number as number, episode] as const)
  );
  const downloadingEpisodes = new Set(
    sonarrQueue
      .filter((entry) => entry.episode?.seasonNumber === seasonNumber && typeof entry.episode?.episodeNumber === 'number')
      .map((entry) => entry.episode?.episodeNumber as number)
  );
  const authoritativeEpisodeNumbers = tvdbByEpisodeNumber.size
    ? [...tvdbByEpisodeNumber.keys()]
    : (jellyfinByEpisodeNumber.size > 0 || sonarrByEpisodeNumber.size > 0)
      ? [
          ...jellyfinByEpisodeNumber.keys(),
          ...sonarrByEpisodeNumber.keys()
        ]
    : [
        ...tmdbByEpisodeNumber.keys(),
        ...jellyfinByEpisodeNumber.keys(),
        ...sonarrByEpisodeNumber.keys()
      ];
  const episodeNumbers = new Set<number>(authoritativeEpisodeNumbers);

  return [...episodeNumbers]
    .sort((left, right) => left - right)
    .map((episodeNumber) => {
      const tvdbEpisode = tvdbByEpisodeNumber.get(episodeNumber);
      const tmdbEpisode = tmdbByEpisodeNumber.get(episodeNumber);
      const sonarrEpisode = sonarrByEpisodeNumber.get(episodeNumber);
      const jellyfinEpisode = matchJellyfinEpisode(
        jellyfinEpisodes,
        episodeNumber,
        sonarrEpisode?.title || tvdbEpisode?.name || tmdbEpisode?.name,
        sonarrEpisode?.airDateUtc || tvdbEpisode?.aired || tmdbEpisode?.air_date
      ) || jellyfinByEpisodeNumber.get(episodeNumber);
      const queueEntry = sonarrQueue.find((entry) => entry.episode?.seasonNumber === seasonNumber && entry.episode?.episodeNumber === episodeNumber);
      const airDate = sonarrEpisode?.airDateUtc || tmdbEpisode?.air_date || tvdbEpisode?.aired;
      const isReleased = !airDate || new Date(airDate).getTime() <= Date.now();
      const hasFile = Boolean(sonarrEpisode?.hasFile || sonarrEpisode?.episodeFileId);
      const isAvailableInJellyfin = Boolean(jellyfinEpisode?.id);
      const isDownloading = downloadingEpisodes.has(episodeNumber);
      const sonarrEpisodeId = sonarrEpisode?.id;
      const isProcessing = Boolean(
        !isDownloading
        && sonarrEpisodeId
        && sonarrCommands.some((command) => isActiveEpisodeSearchCommand(command, sonarrEpisodeId))
      );
      const availability: TitleDetailsEpisode['availability'] = !isReleased
        ? 'unaired'
        : isAvailableInJellyfin || hasFile
          ? 'available'
          : isDownloading
            ? 'downloading'
            : 'missing';
      const downloadStatus: TitleDetailsEpisode['downloadStatus'] = isDownloading
        ? 'downloading'
        : isProcessing
          ? 'processing'
          : 'idle';

      return {
        id: jellyfinEpisode?.id || buildEpisodeId(seasonNumber, episodeNumber),
        sonarrEpisodeId,
        seasonId: season.id,
        title: tvdbEpisode?.name || sonarrEpisode?.title || jellyfinEpisode?.title || tmdbEpisode?.name || `Episode ${episodeNumber}`,
        overview: tvdbEpisode?.overview || sonarrEpisode?.overview || jellyfinEpisode?.overview || tmdbEpisode?.overview || '',
        subtitle: [
          typeof seasonNumber === 'number' ? `Season ${seasonNumber}` : '',
          `Episode ${episodeNumber}`
        ].filter(Boolean).join(', '),
        imageUrl: resolveTvdbImageUrl(tvdbEpisode?.image)
          || jellyfinEpisode?.imageUrl
          || (tmdbEpisode?.still_path ? `${TMDB_IMAGE}/w780${tmdbEpisode.still_path}` : '')
          || season.imageUrl
          || '',
        airDate: tvdbEpisode?.aired || airDate,
        seasonNumber,
        episodeNumber,
        runtimeMinutes: tvdbEpisode?.runtime || sonarrEpisode?.runtime || jellyfinEpisode?.runtimeMinutes || tmdbEpisode?.runtime,
        availableInJellyfin: isAvailableInJellyfin,
        availability,
        downloadStatus,
        downloadProgress: isDownloading ? getEpisodeQueueProgress(queueEntry) : undefined,
        canDownload: isManagedInSonarr && availability === 'missing',
        canDelete: hasFile,
        watched: jellyfinEpisode?.watched,
        progress: jellyfinEpisode?.progress,
        playbackPositionTicks: jellyfinEpisode?.playbackPositionTicks
      };
    });
}

function getEpisodeQueueProgress(entry: SonarrQueueRecord | undefined): number | undefined {
  if (!entry) {
    return undefined;
  }

  const total = Number(entry.size || 0);
  const left = Number(entry.sizeleft || 0);
  if (!total || total <= 0) {
    return undefined;
  }

  const percent = Math.round(((total - left) / total) * 100);
  return Math.max(0, Math.min(100, percent));
}

function buildTitleSeasons(
  seasons: SeriesSeasonDescriptor[],
  allEpisodes: TitleDetailsEpisode[],
  sonarrEpisodes: SonarrEpisodeRecord[],
  sonarrQueue: SonarrQueueRecord[],
  sonarrCommands: SonarrCommandRecord[]
): TitleDetailsSeason[] {
  const seasonMap = new Map<number, TitleDetailsSeason>();

  for (const season of seasons) {
    const seasonQueue = sonarrQueue.filter((entry) => entry.episode?.seasonNumber === season.seasonNumber);
    const availableEpisodeCount = sonarrEpisodes.filter(
      (episode) => episode.seasonNumber === season.seasonNumber && (episode.hasFile || episode.episodeFileId)
    ).length;
    const isDownloading = seasonQueue.length > 0;
    const isProcessing = sonarrCommands.some((command) =>
      command.body?.seasonNumber === season.seasonNumber && isActiveSeasonSearchCommand(command)
    );
    seasonMap.set(season.seasonNumber ?? Number.MIN_SAFE_INTEGER, {
      id: season.id,
      title: season.title,
      seasonNumber: season.seasonNumber,
      episodeCount: season.episodeCount,
      availableEpisodeCount,
      missingEpisodeCount: typeof season.episodeCount === 'number'
        ? Math.max(season.episodeCount - availableEpisodeCount, 0)
        : undefined,
      canDownload: false,
      canDelete: typeof season.episodeCount === 'number'
        ? availableEpisodeCount >= season.episodeCount
        : availableEpisodeCount > 0,
      isDownloading,
      downloadStatus: isDownloading ? 'downloading' : isProcessing ? 'processing' : 'idle',
      downloadProgress: isDownloading ? getSeasonQueueProgress(seasonQueue) : undefined,
      downloadLabel: isDownloading ? 'Downloading' : isProcessing ? 'Processing' : undefined
    });
  }

  for (const season of seasons) {
    const seasonEpisodes = allEpisodes.filter((episode) => episode.seasonId === season.id);
    if (!seasonEpisodes.length || typeof season.seasonNumber !== 'number') {
      continue;
    }

    const current = seasonMap.get(season.seasonNumber);
    if (!current) {
      continue;
    }

    seasonMap.set(season.seasonNumber, {
      ...current,
      episodeCount: seasonEpisodes.length || current.episodeCount,
      availableEpisodeCount: seasonEpisodes.filter((episode) => episode.availability === 'available').length,
      missingEpisodeCount: seasonEpisodes.filter((episode) => episode.availability === 'missing').length,
      canDownload: seasonEpisodes.some((episode) => episode.canDownload),
      canDelete: seasonEpisodes.length > 0 && seasonEpisodes.every((episode) => episode.canDelete),
      isDownloading: current.isDownloading || seasonEpisodes.some((episode) => episode.availability === 'downloading')
    });
  }

  return seasons
    .map((season) => seasonMap.get(season.seasonNumber ?? Number.MIN_SAFE_INTEGER))
    .filter((season): season is TitleDetailsSeason => Boolean(season));
}

function buildSeasonId(seasonNumber?: number, fallback?: string): string {
  return typeof seasonNumber === 'number'
    ? `season:${seasonNumber}`
    : `season:${fallback || 'unknown'}`;
}

function buildEpisodeId(seasonNumber: number | undefined, episodeNumber: number): string {
  return `episode:${typeof seasonNumber === 'number' ? seasonNumber : 'x'}:${episodeNumber}`;
}

function sortSeasonDescriptors(left: { seasonNumber?: number }, right: { seasonNumber?: number }) {
  const leftNumber = left.seasonNumber === 0 ? Number.MAX_SAFE_INTEGER : left.seasonNumber ?? Number.MAX_SAFE_INTEGER - 1;
  const rightNumber = right.seasonNumber === 0 ? Number.MAX_SAFE_INTEGER : right.seasonNumber ?? Number.MAX_SAFE_INTEGER - 1;
  return leftNumber - rightNumber;
}

function isActiveSeasonSearchCommand(command: SonarrCommandRecord): boolean {
  const name = String(command.name || command.commandName || '').toLowerCase();
  const status = String(command.status || command.state || '').toLowerCase();
  return name === 'seasonsearch'
    && status !== 'completed'
    && status !== 'failed'
    && status !== 'aborted'
    && status !== 'cancelled'
    && status !== 'orphaned';
}

function isActiveEpisodeSearchCommand(command: SonarrCommandRecord, episodeId: number): boolean {
  const name = String(command.name || command.commandName || '').toLowerCase();
  const status = String(command.status || command.state || '').toLowerCase();
  const episodeIds = Array.isArray(command.body?.episodeIds) ? command.body.episodeIds : [];
  return name === 'episodesearch'
    && episodeIds.includes(episodeId)
    && status !== 'completed'
    && status !== 'failed'
    && status !== 'aborted'
    && status !== 'cancelled'
    && status !== 'orphaned';
}

function isActiveMovieSearchCommand(command: RadarrCommandRecord, movieId: number): boolean {
  const name = String(command.name || command.commandName || '').toLowerCase();
  const status = String(command.status || command.state || '').toLowerCase();
  const movieIds = Array.isArray(command.body?.movieIds) ? command.body.movieIds : [];
  return name === 'moviessearch'
    && movieIds.includes(movieId)
    && status !== 'completed'
    && status !== 'failed'
    && status !== 'aborted'
    && status !== 'cancelled'
    && status !== 'orphaned';
}

function getSeasonQueueProgress(queue: SonarrQueueRecord[]): number | undefined {
  if (!queue.length) {
    return undefined;
  }

  const totalSize = queue.reduce((sum, item) => sum + Math.max(0, Number(item.size || 0)), 0);
  const totalSizeLeft = queue.reduce((sum, item) => sum + Math.max(0, Number(item.sizeleft || 0)), 0);

  if (!totalSize) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(((totalSize - totalSizeLeft) / totalSize) * 100)));
}

function getMovieQueueProgress(entry: RadarrQueueRecord | undefined): number | undefined {
  if (!entry) {
    return undefined;
  }

  const total = Number(entry.size || 0);
  const left = Number(entry.sizeleft || 0);
  if (!total || total <= 0) {
    return undefined;
  }

  const percent = Math.round(((total - left) / total) * 100);
  return Math.max(0, Math.min(100, percent));
}

async function getNextEpisodeToPlay(
  config: AppConfig,
  seriesId: string
): Promise<TitleDetailsEpisode | null> {
  if (!config.jellyfin.baseUrl || !config.jellyfin.apiKey || !config.jellyfin.userId) {
    return null;
  }

  try {
    const response = await jellyfinFetch<{ Items?: JellyfinItem[] }>(
      config,
      `/Shows/NextUp?userId=${encodeURIComponent(config.jellyfin.userId)}&seriesId=${encodeURIComponent(seriesId)}&enableUserData=true&fields=Overview,ImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber&limit=1`
    );
    const episode = response.Items?.find((item) => item.Id);
    if (episode) {
      return mapJellyfinEpisode(episode);
    }
  } catch {
    // Fall back to a full episode scan when NextUp is unavailable.
  }

  try {
    const episodes = await getSeriesEpisodesForNextUp(config, seriesId);
    const nextEpisode = episodes.find((episode) => !episode.watched);
    return nextEpisode || episodes[0] || null;
  } catch {
    return null;
  }
}

async function getSeriesEpisodesForNextUp(config: AppConfig, seriesId: string): Promise<TitleDetailsEpisode[]> {
  const episodes = await jellyfinFetch<JellyfinItem[]>(
    config,
    `/Users/${encodeURIComponent(config.jellyfin.userId)}/Items?parentId=${encodeURIComponent(seriesId)}&recursive=true&includeItemTypes=Episode&enableUserData=true&fields=Overview,ImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber&sortBy=SortName`
  );

  return episodes
    .filter((episode) => episode.Id)
    .sort((left, right) => {
      const seasonDifference = (left.ParentIndexNumber ?? 0) - (right.ParentIndexNumber ?? 0);
      if (seasonDifference !== 0) {
        return seasonDifference;
      }

      return (left.IndexNumber ?? 0) - (right.IndexNumber ?? 0);
    })
    .map(mapJellyfinEpisode);
}

function mapJellyfinEpisode(episode: JellyfinItem): TitleDetailsEpisode {
  const imageTag = episode.ImageTags?.Primary || '';

  return {
    id: String(episode.Id),
    title: episode.Name || `Episode ${episode.IndexNumber ?? ''}`.trim(),
    overview: episode.Overview || '',
    subtitle: [
      typeof episode.ParentIndexNumber === 'number' ? `Season ${episode.ParentIndexNumber}` : '',
      typeof episode.IndexNumber === 'number' ? `Episode ${episode.IndexNumber}` : ''
    ].filter(Boolean).join(', '),
    imageUrl: imageTag ? buildJellyfinAssetUrl(String(episode.Id), 'Primary', 960, imageTag) : '',
    airDate: episode.PremiereDate,
    seasonNumber: episode.ParentIndexNumber,
    episodeNumber: episode.IndexNumber,
    runtimeMinutes: episode.RunTimeTicks ? Math.max(1, Math.round(episode.RunTimeTicks / 600000000)) : undefined,
    availableInJellyfin: true,
    availability: 'available',
    watched: Boolean(episode.UserData?.Played),
    progress: Math.max(0, Math.min(100, Math.round(episode.UserData?.PlayedPercentage || 0))) || undefined,
    playbackPositionTicks: episode.UserData?.PlaybackPositionTicks
  };
}

export async function requestMovie(config: AppConfig, tmdbId: number): Promise<void> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    throw new Error('Radarr is not configured.');
  }
  if (!tmdbId) {
    throw new Error('Movie TMDb id is required.');
  }
  const radarrRequestConfig = await resolveRadarrRequestConfig(config);

  const details = await tmdbFetch(config, `/movie/${tmdbId}?language=${encodeURIComponent(config.preferences.language)}`);
  if (!details) {
    throw new Error('Failed to load the movie from TMDb.');
  }

  try {
    await fetchJson(`${config.radarr.baseUrl}/api/v3/movie`, {
      method: 'POST',
      headers: {
        'X-Api-Key': config.radarr.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: details.title || details.original_title || 'Movie',
        qualityProfileId: radarrRequestConfig.qualityProfileId,
        rootFolderPath: radarrRequestConfig.rootFolderPath,
        tmdbId: details.id,
        year: Number(String(details.release_date || '').slice(0, 4)) || 0,
        minimumAvailability: 'released',
        addOptions: {
          monitored: config.radarr.monitor !== 'none',
          searchForMovie: true
        }
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const looksLikeAlreadyExists = message.includes('already') || message.includes('exists') || message.includes('duplicate');

    if (!looksLikeAlreadyExists) {
      throw error;
    }

    const existingMovie = await getRadarrMovieRecord(config, tmdbId);
    if (!existingMovie?.id) {
      throw error;
    }

    if (existingMovie.hasFile) {
      return;
    }

    await fetchJson(`${config.radarr.baseUrl}/api/v3/command`, {
      method: 'POST',
      headers: {
        'X-Api-Key': config.radarr.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'MoviesSearch',
        movieIds: [existingMovie.id],
        qualityProfileId: radarrRequestConfig.qualityProfileId
      })
    });
  }
}

export async function requestSeries(config: AppConfig, tmdbId: number): Promise<void> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    throw new Error('Sonarr is not configured.');
  }

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
  const sonarrRequestConfig = await resolveSonarrRequestConfig(config);

  await fetchJson(`${config.sonarr.baseUrl}/api/v3/series`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.sonarr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: details.name || details.original_name || 'Series',
      tvdbId,
      qualityProfileId: sonarrRequestConfig.qualityProfileId,
      languageProfileId: sonarrRequestConfig.languageProfileId,
      rootFolderPath: sonarrRequestConfig.rootFolderPath,
      seasonFolder: true,
      monitored: config.sonarr.monitor !== 'none',
      addOptions: {
        monitor: config.sonarr.monitor,
        searchForMissingEpisodes: true,
        searchForCutoffUnmetEpisodes: true
      }
    })
  });
}

export async function requestSeason(config: AppConfig, payload: SeasonRequestPayload): Promise<void> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    throw new Error('Sonarr is not configured.');
  }

  if (!payload.seriesId || !payload.seasonNumber) {
    throw new Error('Series id and season number are required.');
  }

  const series = await getSonarrSeriesById(config, payload.seriesId);
  if (!series?.id) {
    throw new Error('Series not found in Sonarr.');
  }

  const nextSeasons = (series.seasons || []).map((season) =>
    season.seasonNumber === payload.seasonNumber
      ? { ...season, monitored: true }
      : season
  );

  if (!nextSeasons.some((season) => season.seasonNumber === payload.seasonNumber && season.monitored)) {
    throw new Error(`Season ${payload.seasonNumber} not found in Sonarr.`);
  }

  await fetchJson(`${config.sonarr.baseUrl}/api/v3/series/${encodeURIComponent(String(payload.seriesId))}`, {
    method: 'PUT',
    headers: {
      'X-Api-Key': config.sonarr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...series,
      seasons: nextSeasons
    })
  });

  await fetchJson(`${config.sonarr.baseUrl}/api/v3/command`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.sonarr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'SeasonSearch',
      seriesId: payload.seriesId,
      seasonNumber: payload.seasonNumber
    })
  });
}

export async function requestEpisode(config: AppConfig, payload: EpisodeRequestPayload): Promise<void> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    throw new Error('Sonarr is not configured.');
  }

  if (!payload.episodeId) {
    throw new Error('Episode id is required.');
  }

  await fetchJson(`${config.sonarr.baseUrl}/api/v3/command`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.sonarr.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'EpisodeSearch',
      episodeIds: [payload.episodeId]
    })
  });
}

export async function deleteSeasonFiles(config: AppConfig, payload: SeasonDeletePayload): Promise<void> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    throw new Error('Sonarr is not configured.');
  }

  if (!payload.seriesId || !payload.seasonNumber) {
    throw new Error('Series id and season number are required.');
  }

  const [episodes, files] = await Promise.all([
    getSonarrEpisodesBySeriesId(config, payload.seriesId),
    getSonarrEpisodeFilesBySeriesId(config, payload.seriesId)
  ]);
  const fileIds = new Set(
    episodes
      .filter((episode) => episode.seasonNumber === payload.seasonNumber && episode.episodeFileId)
      .map((episode) => Number(episode.episodeFileId))
  );

  for (const file of files) {
    if (file.seasonNumber === payload.seasonNumber && file.id) {
      fileIds.add(Number(file.id));
    }
  }

  await Promise.all(
    [...fileIds].map((fileId) =>
      fetchJson(`${config.sonarr.baseUrl}/api/v3/episodefile/${encodeURIComponent(String(fileId))}`, {
        method: 'DELETE',
        headers: {
          'X-Api-Key': config.sonarr.apiKey
        }
      })
    )
  );
}

export async function setEpisodeWatchState(config: AppConfig, payload: EpisodeWatchStateRequest): Promise<void> {
  if (!config.jellyfin.baseUrl || !config.jellyfin.apiKey || !config.jellyfin.userId) {
    throw new Error('Jellyfin is not configured.');
  }

  const episodeId = String(payload.episodeId || '')
  if (!episodeId) {
    throw new Error('Episode id is required.')
  }

  const path = `/Users/${encodeURIComponent(config.jellyfin.userId)}/PlayedItems/${encodeURIComponent(episodeId)}`
  const url = `${config.jellyfin.baseUrl}${path}`
  const response = await fetch(payload.watched ? `${url}?datePlayed=${encodeURIComponent(new Date().toISOString())}` : url, {
    method: payload.watched ? 'POST' : 'DELETE',
    headers: {
      Accept: 'application/json',
      'X-Emby-Token': config.jellyfin.apiKey
    }
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
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
        `/Users/${config.jellyfin.userId}/Items?recursive=true&includeItemTypes=Movie,Series&hasTmdbId=true&fields=ProviderIds,DateCreated,DateLastMediaAdded,Overview,ImageTags,BackdropImageTags,ProductionYear`
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

  const continueWatching = dedupeContinueWatchingItems([...resume, ...nextUp])
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

function dedupeContinueWatchingItems(items: JellyfinItem[]): JellyfinItem[] {
  const seen = new Set<string>();
  const deduped: JellyfinItem[] = [];

  for (const item of items) {
    const key = getContinueWatchingKey(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function getContinueWatchingKey(item: JellyfinItem): string {
  if (item.Type === 'Episode') {
    const seriesKey = item.SeriesId || item.SeriesName || item.Id || 'series';
    const seasonKey = typeof item.ParentIndexNumber === 'number' ? item.ParentIndexNumber : 'x';
    const episodeKey = typeof item.IndexNumber === 'number' ? item.IndexNumber : item.Id || 'x';
    return `episode:${seriesKey}:${seasonKey}:${episodeKey}`;
  }

  return `${item.Type || 'item'}:${item.Id || item.Name || 'unknown'}`;
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
      { id: 'digital', title: 'New Digital Releases', style: 'landscape', items: filter(digitalReleases || []) },
      { id: 'streaming', title: 'Streaming Now', style: 'landscape', items: filter(streamingNow || []) },
      { id: 'recently-added', title: 'Recently Added', style: 'landscape', items: library.recentlyAdded || [] },
      { id: 'upcoming-movies', title: 'Upcoming Movies', style: 'landscape', items: filter(upcomingMovies || []) },
      { id: 'upcoming-series', title: 'Upcoming Series', style: 'landscape', items: filter(upcomingSeries || []) }
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

async function getSonarrCalendar(config: AppConfig, start: Date, end: Date): Promise<SonarrCalendarRecord[]> {
  if (!config.sonarr.baseUrl || !config.sonarr.apiKey) {
    return []
  }

  return fetchJson<SonarrCalendarRecord[]>(
    `${config.sonarr.baseUrl}/api/v3/calendar?includeSeries=true&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    {
      headers: {
        'X-Api-Key': config.sonarr.apiKey
      }
    }
  )
}

async function getRadarrCalendar(config: AppConfig, start: Date, end: Date): Promise<RadarrCalendarRecord[]> {
  if (!config.radarr.baseUrl || !config.radarr.apiKey) {
    return []
  }

  return fetchJson<RadarrCalendarRecord[]>(
    `${config.radarr.baseUrl}/api/v3/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    {
      headers: {
        'X-Api-Key': config.radarr.apiKey
      }
    }
  )
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

async function testTvdb(config: AppConfig): Promise<ConnectionStatus> {
  if (!getTvdbApiKey(config)) {
    return {
      key: 'tvdb',
      label: 'TVDB',
      ok: false,
      message: 'Missing API key'
    };
  }

  try {
    await getTvdbToken(config);
    return { key: 'tvdb', label: 'TVDB', ok: true, message: 'Connected' };
  } catch (error) {
    return {
      key: 'tvdb',
      label: 'TVDB',
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

async function tvdbFetch(config: AppConfig, pathWithQuery: string): Promise<Record<string, unknown> | null> {
  try {
    const token = await getTvdbToken(config);
    if (!token) {
      return null;
    }

    return await fetchJson<Record<string, unknown>>(`https://api4.thetvdb.com/v4${pathWithQuery}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Language': getTvdbAcceptLanguage(config)
      }
    });
  } catch (err) {
    console.error(`TVDB fetch failed for ${pathWithQuery}:`, err);
    return null;
  }
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
      const responseText = await response.text().catch(() => '');
      let detail = responseText.trim();

      if (detail) {
        try {
          const parsed = JSON.parse(detail) as { message?: string; error?: string };
          detail = String(parsed.message || parsed.error || detail);
        } catch {
          // Keep plain-text response bodies as-is.
        }
      }

      throw new Error(detail
        ? `${response.status} ${response.statusText}: ${detail}`
        : `${response.status} ${response.statusText}`);
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
    backdropUrl: `/api/assets/jellyfin/${backdropItemId}?kind=Backdrop&maxWidth=1920&tag=${encodeURIComponent(backdropTag)}`,
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
    backdropUrl: backdropPath ? `${TMDB_IMAGE}/w1280${backdropPath}` : '',
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
    backdropLanguageFallback: partial.backdropLanguageFallback,
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

function uniqueSearchCards(items: MediaCard[]): MediaCard[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.tmdbId
      ? `tmdb:${item.tmdbId}`
      : item.providerId
        ? `provider:${item.providerId}`
        : item.id;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Match TMDb's English backdrop tab for landscape cards where available.
async function applyHighResBackdropsToSections(
  config: AppConfig,
  sections: HubSection[],
  backdropCache: Map<string, Promise<TmdbBackdropChoice>>,
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

async function applyTitleLogosToSections(
  config: AppConfig,
  sections: HubSection[]
): Promise<HubSection[]> {
  return Promise.all(
    sections.map(async (section) => {
      if (section.style !== 'landscape') {
        return section;
      }

      const items = await applyTitleLogosToCards(config, section.items);

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
  backdropCache: Map<string, Promise<TmdbBackdropChoice>>,
  preferredLanguage?: string | null
): Promise<MediaCard[]> {
  return Promise.all(
    cards.map(async (card) => {
      if (!shouldApply(card)) {
        return card;
      }

      const mediaType: 'movie' | 'tv' = card.mediaType === 'movie' ? 'movie' : 'tv';
      const cacheKey = `${mediaType}:${card.tmdbId}:${preferredLanguage || 'any'}:${card.originalLanguage || 'none'}`;
      let backdropPromise = backdropCache.get(cacheKey);
      if (!backdropPromise) {
        backdropPromise = getTmdbHighResBackdropChoice(config, card.tmdbId!, mediaType, preferredLanguage, card.originalLanguage);
        backdropCache.set(cacheKey, backdropPromise);
      }

      const backdropChoice = await backdropPromise;
      return backdropChoice.url
        ? {
            ...card,
            backdropUrl: backdropChoice.url,
            backdropLanguageFallback: backdropChoice.backdropLanguageFallback
          }
        : card;
    })
  );
}

async function applyTitleLogosToCards(
  config: AppConfig,
  cards: MediaCard[]
): Promise<MediaCard[]> {
  const logoCache = new Map<string, Promise<string>>();

  return Promise.all(
    cards.map(async (card) => {
      if (card.logoUrl || !card.tmdbId) {
        return card;
      }

      const mediaType = resolveTmdbLogoMediaType(card);
      if (!mediaType) {
        return card;
      }

      const cacheKey = `${mediaType}:${card.tmdbId}`;
      let logoPromise = logoCache.get(cacheKey);
      if (!logoPromise) {
        logoPromise = getPreferredTitleLogo(config, card.tmdbId, mediaType);
        logoCache.set(cacheKey, logoPromise);
      }

      const logoUrl = await logoPromise;
      return logoUrl
        ? {
            ...card,
            logoUrl
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

function resolveTmdbLogoMediaType(card: MediaCard): 'movie' | 'tv' | null {
  if (card.mediaType === 'movie') {
    return 'movie';
  }

  if (card.mediaType === 'tv' || card.mediaType === 'series' || card.mediaType === 'episode') {
    return 'tv';
  }

  return null;
}

function tmdbImagesPath(tmdbId: number, mediaType: 'movie' | 'tv'): string {
  return `/${mediaType}/${tmdbId}/images?include_image_language=en,en-US,null`;
}

function tmdbBackdropImagesPath(tmdbId: number, mediaType: 'movie' | 'tv'): string {
  return `/${mediaType}/${tmdbId}/images`;
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
  preferredLanguage?: string | null,
  originalLanguage?: string | null
): Promise<string> {
  const choice = await getTmdbHighResBackdropChoice(config, tmdbId, mediaType, preferredLanguage, originalLanguage);
  return choice.url;
}

async function getTmdbHighResBackdropChoice(
  config: AppConfig,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  preferredLanguage?: string | null,
  originalLanguage?: string | null
): Promise<{ url: string; backdropLanguageFallback: boolean }> {
  try {
    const response = await tmdbFetch(config, tmdbBackdropImagesPath(tmdbId, mediaType));
    let backdrops = asArray(response?.backdrops)
      .map((entry) => asRecord(entry));
    
    if (backdrops.length === 0) {
      return { url: '', backdropLanguageFallback: false };
    }

    const sortByWidthDesc = (items: Record<string, unknown>[]) =>
      [...items].sort((a, b) => Number(b.width || 0) - Number(a.width || 0));

    // Filter by language if requested
    if (preferredLanguage) {
      const filtered = backdrops.filter((b) => {
        const language = String(b.iso_639_1 || '');
        if (preferredLanguage === 'en') {
          return language === 'en' || language === 'en-US';
        }
        return language === preferredLanguage;
      });
      if (filtered.length > 0) {
        backdrops = filtered;
      } else if (preferredLanguage === 'en' && (originalLanguage === 'ja' || originalLanguage === 'ko')) {
        const fallbackFiltered = backdrops.filter(
          (b) => String(b.iso_639_1 || '') === originalLanguage
        );
        if (fallbackFiltered.length > 0) {
          backdrops = fallbackFiltered;
        }
      }
    }

    if (!preferredLanguage) {
      const noLanguageBackdrops = sortByWidthDesc(
        backdrops.filter((entry) => entry.iso_639_1 == null)
      );
      if (noLanguageBackdrops.length > 0) {
        backdrops = noLanguageBackdrops;
      } else {
        const englishBackdrops = sortByWidthDesc(
          backdrops.filter((entry) => entry.iso_639_1 === 'en' || entry.iso_639_1 === 'en-US')
        );
        backdrops = englishBackdrops.length > 0 ? englishBackdrops : sortByWidthDesc(backdrops);
      }
    }

    const selectedBackdrop = backdrops.find(
      (entry) => typeof entry.file_path === 'string' && entry.file_path
    );

    return selectedBackdrop?.file_path
      ? {
          url: `${TMDB_IMAGE}/original${String(selectedBackdrop.file_path)}`,
          backdropLanguageFallback: preferredLanguage === 'en' && selectedBackdrop.iso_639_1 == null
        }
      : { url: '', backdropLanguageFallback: false };
  } catch {
    return { url: '', backdropLanguageFallback: false };
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

function getTvdbApiKey(config: AppConfig): string {
  return process.env.TVDB_API_KEY || config.tvdb.apiKey;
}

function getTvdbAcceptLanguage(config: AppConfig): string {
  const preferred = String(config.preferences.language || '').trim();
  const normalized = preferred.replace('_', '-');
  const base = normalized.split('-')[0] || '';
  const tags = [
    normalized,
    base && base !== normalized ? base : '',
    'en'
  ].filter(Boolean);

  return tags
    .filter((tag, index) => tags.indexOf(tag) === index)
    .map((tag, index) => index === 0 ? tag : `${tag};q=${(1 - index * 0.1).toFixed(1)}`)
    .join(', ');
}

async function getTvdbToken(config: AppConfig): Promise<string> {
  if (tvdbTokenCache && tvdbTokenCache.expiresAt > Date.now()) {
    return tvdbTokenCache.token;
  }

  const apiKey = getTvdbApiKey(config);
  if (!apiKey) {
    throw new Error('TVDB API key is missing.');
  }

  const response = await fetchJson<Record<string, unknown>>('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      apikey: apiKey
    })
  });
  const data = asRecord(response.data);
  const token = typeof data.token === 'string' ? data.token : '';
  if (!token) {
    throw new Error('TVDB login did not return a token.');
  }

  tvdbTokenCache = {
    token,
    expiresAt: Date.now() + 1000 * 60 * 60 * 12
  };
  return token;
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
