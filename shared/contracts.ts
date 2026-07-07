export type AppRoute =
  | 'stream'
  | 'home'
  | 'anime'
  | 'dorama'
  | 'netflix'
  | 'primevideo'
  | 'hbo'
  | 'viki'
  | 'disney'
  | 'library'
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

export interface AppPreferences {
  language: string;
  region: string;
  excludeLibraryItems: boolean;
  animationLevel: 'smooth' | 'reduced';
}

export interface AppConfig {
  preferences: AppPreferences;
  jellyfin: JellyfinConfig;
  sonarr: SonarrConfig;
  radarr: RadarrConfig;
  tmdb: TmdbConfig;
}

export interface SelectOption {
  id: string;
  label: string;
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
  key: 'jellyfin' | 'sonarr' | 'radarr' | 'tmdb';
  label: string;
  ok: boolean;
  message: string;
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

export interface TitleDetailsResponse {
  id: string;
  tmdbId?: number;
  providerId?: string;
  sonarrSeriesId?: number;
  playTargetId?: string;
  availableInJellyfin: boolean;
  title: string;
  overview: string;
  subtitle: string;
  mediaType: 'movie' | 'series';
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string;
  selectedSeasonId?: string;
  seasons: TitleDetailsSeason[];
  episodes: TitleDetailsEpisode[];
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

export interface DashboardResponse {
  connections: ConnectionStatus[];
  hero: MediaCard[];
  continueWatching: MediaCard[];
  recentlyAdded: MediaCard[];
  recommendations: MediaCard[];
  trendingSeries: MediaCard[];
  downloads: DownloadItem[];
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
}

export interface SeasonDeletePayload {
  seriesId: number;
  seasonNumber: number;
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
}

export interface AuthPayload {
  password: string;
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
    animationLevel: 'smooth'
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
  }
};
