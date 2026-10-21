export type AppRoute =
  | 'stream'
  | 'home'
  | 'search'
  | 'anime'
  | 'dorama'
  | 'netflix'
  | 'primevideo'
  | 'hbo'
  | 'viki'
  | 'disney'
  | 'library'
  | 'calendar'
  | 'downloads'
  | 'settings';

export interface ServiceConfig {
  baseUrl: string;
}

export interface JellyfinConfig extends ServiceConfig {
  apiKey: string;
  userId: string;
}

export interface SonarrConfig extends ServiceConfig {
  apiKey: string;
  rootFolderPath: string;
  qualityProfileId: number;
  languageProfileId: number;
  monitor: string;
  startSearch: boolean;
}

export interface RadarrConfig extends ServiceConfig {
  apiKey: string;
  rootFolderPath: string;
  qualityProfileId: number;
  monitor: string;
  startSearch: boolean;
}

export interface TmdbConfig {
  bearerToken: string;
}

export interface TvdbConfig {
  apiKey: string;
}

export interface AppPreferences {
  language: string;
  region: string;
  excludeLibraryItems: boolean;
  animationLevel: 'smooth' | 'reduced';
  sonarrDownloadQualityProfileIds: string[];
  radarrDownloadQualityProfileIds: string[];
}

export interface AppConfig {
  preferences: AppPreferences;
  jellyfin: JellyfinConfig;
  sonarr: SonarrConfig;
  radarr: RadarrConfig;
  tmdb: TmdbConfig;
  tvdb: TvdbConfig;
}

export interface SelectOption {
  id: string;
  label: string;
  imageUrl?: string;
}

export interface ServiceOptionsResponse {
  jellyfinUsers: SelectOption[];
  sonarrRootFolders: SelectOption[];
  sonarrQualityProfiles: SelectOption[];
  sonarrLanguageProfiles: SelectOption[];
  radarrRootFolders: SelectOption[];
  radarrQualityProfiles: SelectOption[];
}

export interface ConnectionStatus {
  key: 'jellyfin' | 'sonarr' | 'radarr' | 'tmdb' | 'tvdb';
  label: string;
  ok: boolean;
  message: string;
  /** Every field the service needs is filled in. */
  configured: boolean;
  /** The app works without it; only Jellyfin is required. */
  optional: boolean;
  /** Some of its fields are filled in but not all of them. */
  incomplete?: boolean;
}

export interface DiskSpaceStatus {
  totalBytes: number;
  availableBytes: number;
  path?: string;
  source: 'radarr' | 'sonarr';
}

export interface MediaCard {
  id: string;
  tmdbId?: number;
  providerId?: string;
  title: string;
  subtitle: string;
  overview: string;
  mediaType: 'movie' | 'tv' | 'episode' | 'series' | 'mixed';
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string;
  backdropLanguageFallback?: boolean;
  badge?: string;
  progress?: number;
  secondaryValue?: string;
  hoverLabel?: string;
  actionLabel?: string;
  accent?: string;
  popularity?: number;
  voteAverage?: number;
  voteCount?: number;
  originalLanguage?: string;
  releaseDate?: string;
  firstAirDate?: string;
  lastAirDate?: string;
  seasonCount?: number;
  mediaStatus?: string;
  genreIds?: number[];
}

export interface TitleDetailsEpisode {
  id: string;
  sonarrEpisodeId?: number;
  seasonId?: string;
  title: string;
  overview: string;
  subtitle: string;
  imageUrl: string;
  airDate?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  runtimeMinutes?: number;
  availableInJellyfin?: boolean;
  availability?: 'available' | 'downloading' | 'missing' | 'unaired';
  downloadStatus?: 'idle' | 'processing' | 'downloading';
  downloadProgress?: number;
  canDownload?: boolean;
  canDelete?: boolean;
  watched?: boolean;
  progress?: number;
  playbackPositionTicks?: number;
}

export interface TitleDetailsSeason {
  id: string;
  title: string;
  seasonNumber?: number;
  episodeCount?: number;
  availableEpisodeCount?: number;
  missingEpisodeCount?: number;
  canDownload?: boolean;
  canDelete?: boolean;
  isDownloading?: boolean;
  downloadStatus?: 'idle' | 'processing' | 'downloading';
  downloadProgress?: number;
  downloadLabel?: string;
}

export interface TitleDetailsCastMember {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
}

export interface TitleDetailsResponse {
  id: string;
  tmdbId?: number;
  providerId?: string;
  sonarrSeriesId?: number;
  radarrMovieId?: number;
  playTargetId?: string;
  availableInJellyfin: boolean;
  title: string;
  overview: string;
  subtitle: string;
  mediaType: 'movie' | 'series';
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string;
  requestStatus?: 'idle' | 'processing' | 'downloading';
  requestProgress?: number;
  selectedSeasonId?: string;
  seasons: TitleDetailsSeason[];
  episodes: TitleDetailsEpisode[];
  cast: TitleDetailsCastMember[];
}

export interface DownloadItem {
  id: string;
  source: 'sonarr' | 'radarr';
  title: string;
  detail: string;
  progress: number;
  state: string;
  subtitle?: string;
  speed?: string;
  eta?: string;
  size?: string;
  posterUrl?: string;
  backdropUrl?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv' | 'series';
}

export interface ProcessingItem {
  id: string;
  source: 'sonarr' | 'radarr';
  title: string;
  subtitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv' | 'series';
  user: string;
  createdAt: string;
}

export interface CompletedDownloadItem {
  id: string;
  source: 'sonarr' | 'radarr';
  title: string;
  subtitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv' | 'series';
  status: 'completed' | 'cancelled';
  completedAt: string;
}

export interface DownloadsResponse {
  processing: ProcessingItem[];
  downloading: DownloadItem[];
  completed: CompletedDownloadItem[];
}

export interface CalendarEntry {
  id: string;
  source: 'sonarr' | 'radarr';
  kind: 'episode' | 'movie';
  startsAt: string;
  title: string;
  subtitle: string;
  detail: string;
  imageUrl?: string;
  stateLabel?: string;
  card: MediaCard;
}

export interface CalendarResponse {
  items: CalendarEntry[];
}

export interface SearchResponse {
  query: string;
  items: MediaCard[];
}

export interface DashboardResponse {
  connections: ConnectionStatus[];
  hero: MediaCard[];
  continueWatching: MediaCard[];
  recentlyAdded: MediaCard[];
  recommendations: MediaCard[];
  trendingSeries: MediaCard[];
  downloads: DownloadItem[];
  processing: ProcessingItem[];
  completedDownloads: CompletedDownloadItem[];
}

export interface TitleDetailsRequest {
  card: MediaCard;
  seasonId?: string;
}

export interface EpisodeWatchStateRequest {
  episodeId: string;
  watched: boolean;
}

export interface SeasonRequestPayload {
  seriesId: number;
  seasonNumber: number;
  qualityProfileId?: number;
}

export interface EpisodeRequestPayload {
  episodeId: number;
  qualityProfileId?: number;
}

export interface SeasonDeletePayload {
  seriesId: number;
  seasonNumber: number;
}

export interface MovieDeletePayload {
  movieId: number;
}

export interface HubSection {
  id: string;
  title: string;
  style?: 'poster' | 'landscape' | 'profile' | 'genre' | 'network' | 'episode';
  items: MediaCard[];
}

export interface HubPageResponse {
  page: 'stream' | 'home' | 'anime' | 'dorama' | 'netflix' | 'primevideo' | 'hbo' | 'viki' | 'disney' | 'library';
  hero: MediaCard[];
  continueWatching?: MediaCard[];
  sections: HubSection[];
}

export interface SessionResponse {
  needsSetup: boolean;
  authenticated: boolean;
  role?: 'admin' | 'user';
  userId?: string;
}

export interface AuthPayload {
  password: string;
}

export interface JellyfinLoginPayload extends AuthPayload {
  userId: string;
}

export interface AuthResponse {
  ok: boolean;
  needsSetup: boolean;
  message?: string;
}

export interface ApiErrorPayload {
  error: string;
}

export const defaultConfig: AppConfig = {
  preferences: {
    language: 'en-US',
    region: 'US',
    excludeLibraryItems: true,
    animationLevel: 'smooth',
    sonarrDownloadQualityProfileIds: [],
    radarrDownloadQualityProfileIds: []
  },
  jellyfin: {
    baseUrl: '',
    apiKey: '',
    userId: ''
  },
  sonarr: {
    baseUrl: '',
    apiKey: '',
    rootFolderPath: '',
    qualityProfileId: 0,
    languageProfileId: 0,
    monitor: 'all',
    startSearch: false
  },
  radarr: {
    baseUrl: '',
    apiKey: '',
    rootFolderPath: '',
    qualityProfileId: 0,
    monitor: 'movieOnly',
    startSearch: false
  },
  tmdb: {
    bearerToken: ''
  },
  tvdb: {
    apiKey: ''
  }
};
