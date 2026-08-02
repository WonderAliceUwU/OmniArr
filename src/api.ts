import type {
  AppConfig,
  AuthPayload,
  AuthResponse,
  CalendarResponse,
  DashboardResponse,
  DownloadsResponse,
  HubPageResponse,
  MediaCard,
  SearchResponse,
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
  getCalendar: (start: Date, end: Date) => request<CalendarResponse>(`/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`),
  getHub: (page: HubPageResponse['page']) => request<HubPageResponse>(`/api/hubs/${page}`),
  searchTitles: (query: string) => request<SearchResponse>(`/api/search?query=${encodeURIComponent(query)}`),
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
  getDownloads: () => request<DownloadsResponse>('/api/downloads'),
  deleteDownload: (payload: { id: string }) =>
    request<{ ok: boolean }>('/api/downloads/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  dismissCompleted: (payload: { id: string }) =>
    request<{ ok: boolean }>('/api/downloads/dismiss', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  dismissAllCompleted: () =>
    request<{ ok: boolean }>('/api/downloads/dismiss-all', {
      method: 'POST',
    }),
  requestMovie: (tmdbId: number, user: string | null) =>
    request<{ ok: boolean }>('/api/requests/movie', {
      method: 'POST',
      body: JSON.stringify({ tmdbId, user }),
    }),
  requestSeries: (tmdbId: number, user: string | null) =>
    request<{ ok: boolean }>('/api/requests/series', {
      method: 'POST',
body: JSON.stringify({ tmdbId, user }),
    }),
  requestSeason: (payload: SeasonRequestPayload, user: string | null) =>
    request<{ ok: boolean }>('/api/requests/season', {
      method: 'POST',
      body: JSON.stringify({ ...payload, user }),
    }),
  requestEpisode: (payload: EpisodeRequestPayload, user: string | null) =>
    request<{ ok: boolean }>('/api/requests/episode', {
      method: 'POST',
      body: JSON.stringify({ ...payload, user }),
    }),
  deleteSeason: (payload: SeasonDeletePayload) =>
    request<{ ok: boolean }>('/api/seasons/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
