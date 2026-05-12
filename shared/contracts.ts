export type AppRoute =
  | 'stream'
  | 'home'
  | 'anime'
  | 'dorama'
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

export interface QbittorrentConfig extends ServiceConfig {
  username: string;
  password: string;
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
  qbittorrent: QbittorrentConfig;
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
  key: 'jellyfin' | 'sonarr' | 'radarr' | 'qbittorrent' | 'tmdb';
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
  badge?: string;
  progress?: number;
  secondaryValue?: string;
  actionLabel?: string;
  accent?: string;
}

export interface DownloadItem {
  id: string;
  source: 'sonarr' | 'radarr' | 'qbittorrent';
  title: string;
  detail: string;
  progress: number;
  state: string;
  speed?: string;
  eta?: string;
  size?: string;
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

export interface HubSection {
  id: string;
  title: string;
  style?: 'poster' | 'landscape' | 'profile' | 'genre' | 'network' | 'episode';
  items: MediaCard[];
}

export interface HubPageResponse {
  page: 'stream' | 'home' | 'anime' | 'dorama' | 'library';
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
  qbittorrent: {
    baseUrl: '',
    username: '',
    password: ''
  },
  tmdb: {
    bearerToken: ''
  }
};
