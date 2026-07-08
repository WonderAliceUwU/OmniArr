import type {
  AppConfig,
  AuthPayload,
  AuthResponse,
  DashboardResponse,
  DownloadItem,
  HubPageResponse,
  MediaCard,
  ServiceOptionsResponse,
  SessionResponse,
  EpisodeWatchStateRequest,
  EpisodeRequestPayload,
  SeasonDeletePayload,
  SeasonRequestPayload,
  TitleDetailsRequest,
  TitleDetailsResponse
} from '../shared/contracts'

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(input, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error('Could not reach the OmniArr backend. Check that the server is running.')
  }

  if (!response.ok) {
    const payload = (await safeJson(response)) as { error?: string } | null
    throw new Error(payload?.error || `${response.status} ${response.statusText}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function safeJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export const api = {
  getSession: () => request<SessionResponse>('/api/auth/session'),
  register: (payload: AuthPayload) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (payload: AuthPayload) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<AuthResponse>('/api/auth/logout', {
      method: 'POST',
    }),
  getSettings: () => request<AppConfig>('/api/settings'),
  saveSettings: (payload: AppConfig) =>
    request<{ config: AppConfig }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getOptions: () => request<ServiceOptionsResponse>('/api/settings/options'),
  loadJellyfinUsers: (payload: { baseUrl: string; apiKey: string }) =>
    request<{ jellyfinUsers: ServiceOptionsResponse['jellyfinUsers'] }>('/api/settings/jellyfin-users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDashboard: () => request<DashboardResponse>('/api/dashboard'),
  getHub: (page: HubPageResponse['page']) => request<HubPageResponse>(`/api/hubs/${page}`),
  getTitleDetails: (card: MediaCard, seasonId?: string) =>
    request<TitleDetailsResponse>('/api/title-details', {
      method: 'POST',
      body: JSON.stringify({ card, seasonId } satisfies TitleDetailsRequest),
    }),
  setEpisodeWatchState: (payload: EpisodeWatchStateRequest) =>
    request<{ ok: boolean }>('/api/episodes/watch-state', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDownloads: () => request<DownloadItem[]>('/api/downloads'),
  deleteDownload: (payload: { id: string }) =>
    request<{ ok: boolean }>('/api/downloads/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestMovie: (tmdbId: number) =>
    request<{ ok: boolean }>('/api/requests/movie', {
      method: 'POST',
      body: JSON.stringify({ tmdbId }),
    }),
  requestSeries: (tmdbId: number) =>
    request<{ ok: boolean }>('/api/requests/series', {
      method: 'POST',
      body: JSON.stringify({ tmdbId }),
    }),
  requestSeason: (payload: SeasonRequestPayload) =>
    request<{ ok: boolean }>('/api/requests/season', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestEpisode: (payload: EpisodeRequestPayload) =>
    request<{ ok: boolean }>('/api/requests/episode', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteSeason: (payload: SeasonDeletePayload) =>
    request<{ ok: boolean }>('/api/seasons/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
