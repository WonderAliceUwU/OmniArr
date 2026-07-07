import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { api } from './api'
import {
  defaultConfig,
  type AppConfig,
  type AppRoute,
  type ConnectionStatus,
  type DownloadItem,
  type HubPageResponse,
  type MediaCard,
  type SelectOption,
  type ServiceOptionsResponse,
  type TitleDetailsCastMember,
  type TitleDetailsEpisode,
  type TitleDetailsResponse,
} from '../shared/contracts'

type AuthState = 'loading' | 'setup' | 'login' | 'app'
type EntryStage = 'onboarding' | 'profiles' | 'dashboard'
type EntryTransitionState = 'idle' | 'forward-enter' | 'forward-exit' | 'back-enter' | 'back-exit'
const MAX_CACHED_HUB_PAGES = 3
type ModalOriginRect = { left: number; top: number; width: number; height: number }
type SelectedCardState = { card: MediaCard; originRect: ModalOriginRect | null }
const EPISODE_SCROLL_DISTANCE_RATIO = 0.72
const SEASON_DOMINANCE_SWITCH_RATIO = 0.12
const SEASON_DOMINANCE_SWITCH_MIN_PX = 56

const sidebarItems: Array<{ route: AppRoute; label: string; short: string }> = [
  { route: 'home', label: 'Inicio', short: 'H' },
  { route: 'dorama', label: 'K-Drama', short: 'K' },
  { route: 'anime', label: 'Anime', short: 'A' },
  { route: 'library', label: 'Library', short: 'L' },
  { route: 'downloads', label: 'Downloads', short: 'D' },
]

const networkSidebarItems: Array<{ route: AppRoute; label: string; icon: string; iconClassName?: string }> = [
  { route: 'netflix', label: 'Netflix', icon: '/networks/netflix.png' },
  { route: 'primevideo', label: 'Prime Video', icon: '/networks/prime.svg' },
  { route: 'hbo', label: 'HBO', icon: '/networks/hbo.svg', iconClassName: 'sidebar-network-icon-image white-network-icon' },
  { route: 'viki', label: 'Viki', icon: '/networks/viki.png' },
  { route: 'disney', label: 'Disney+', icon: '/networks/disney.webp' },
]

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [entryStage, setEntryStage] = useState<EntryStage>('profiles')
  const [route, setRoute] = useState<AppRoute>('home')
  const [busy, setBusy] = useState(false)
  const [jellyfinUsersBusy, setJellyfinUsersBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [password, setPassword] = useState('')
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [options, setOptions] = useState<ServiceOptionsResponse>({
    jellyfinUsers: [],
    sonarrRootFolders: [],
    sonarrQualityProfiles: [],
    sonarrLanguageProfiles: [],
    radarrRootFolders: [],
    radarrQualityProfiles: [],
  })
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [hubPages, setHubPages] = useState<Partial<Record<HubPageResponse['page'], HubPageResponse>>>({})
  const [hubLoading, setHubLoading] = useState(false)
  const [selectedCard, setSelectedCard] = useState<SelectedCardState | null>(null)
  const [downloadDeleteId, setDownloadDeleteId] = useState('')
  const [entryTransitionState, setEntryTransitionState] = useState<EntryTransitionState>('idle')

  async function transitionEntryStage(nextStage: EntryStage) {
    if (nextStage === entryStage) {
      return
    }

    const isProfileDashboardSwitch
      = (entryStage === 'profiles' && nextStage === 'dashboard')
      || (entryStage === 'dashboard' && nextStage === 'profiles')

    if (!isProfileDashboardSwitch) {
      setEntryStage(nextStage)
      return
    }

    setEntryTransitionState(entryStage === 'profiles' ? 'forward-exit' : 'back-exit')
    await wait(240)
    setEntryStage(nextStage)
    setEntryTransitionState(nextStage === 'dashboard' ? 'forward-enter' : 'back-enter')
    await wait(520)
    setEntryTransitionState('idle')
  }

  async function refreshBaseData() {
    const [settings, serviceOptions, dashboard] = await Promise.all([
      api.getSettings(),
      api.getOptions(),
      api.getDashboard(),
    ])

    setConfig(settings)
    setOptions(serviceOptions)
    setDownloads(dashboard.downloads)
    setConnections(dashboard.connections)
    setEntryStage(resolveEntryStage(settings, serviceOptions))
  }

  async function loadHub(page: HubPageResponse['page'], options?: { silent?: boolean }) {
    if (!options?.silent) {
      setHubLoading(true)
    }
    try {
      const hub = await api.getHub(page)
      setHubPages((current) => cacheHubPage(current, page, hub))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load this section.')
    } finally {
      if (!options?.silent) {
        setHubLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const session = await api.getSession()
        if (cancelled) return

        if (session.needsSetup) {
          setAuthState('setup')
          return
        }

        if (!session.authenticated) {
          setAuthState('login')
          return
        }

        await refreshBaseData()
        if (!cancelled) {
          setAuthState('app')
        }
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : 'Failed to start OmniArr.')
          setAuthState('login')
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (authState !== 'app' || entryStage !== 'dashboard') {
      return
    }

    if (route === 'downloads' || route === 'settings') {
      return
    }

    const page = route as HubPageResponse['page']
    let cancelled = false
    setHubLoading(true)

    void api.getHub(page)
      .then((hub) => {
        if (cancelled) return
        setHubPages((current) => cacheHubPage(current, page, hub))
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load this section.')
      })
      .finally(() => {
        if (cancelled) return
        setHubLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authState, entryStage, route])

  useEffect(() => {
    if (authState !== 'app' || entryStage !== 'dashboard') {
      return
    }

    const interval = window.setInterval(() => {
      void refreshBaseData()
      if (route !== 'downloads' && route !== 'settings') {
        void loadHub(route as HubPageResponse['page'], { silent: true })
      }
    }, 30000)

    return () => window.clearInterval(interval)
  }, [authState, entryStage, route])

  async function handleAuthSubmit() {
    setBusy(true)
    setError('')
    try {
      if (authState === 'setup') {
        await api.register({ password })
      } else {
        await api.login({ password })
      }
      await refreshBaseData()
      setPassword('')
      if (authState === 'setup') {
        setNotice('Instance initialized.')
      }
      setAuthState('app')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadJellyfinUsers() {
    setJellyfinUsersBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await api.loadJellyfinUsers({
        baseUrl: config.jellyfin.baseUrl,
        apiKey: config.jellyfin.apiKey,
      })
      setOptions((current) => ({ ...current, jellyfinUsers: response.jellyfinUsers }))
      await transitionEntryStage(response.jellyfinUsers.length ? 'profiles' : 'onboarding')
      setNotice(response.jellyfinUsers.length ? 'Jellyfin users loaded.' : 'No Jellyfin users found.')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Jellyfin users.')
    } finally {
      setJellyfinUsersBusy(false)
    }
  }

  async function handleSelectJellyfinUser(userId: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const nextConfig = {
        ...config,
        jellyfin: {
          ...config.jellyfin,
          userId,
        },
      }
      const response = await api.saveSettings(nextConfig)
      setConfig(response.config)
      await refreshBaseData()
      await transitionEntryStage('dashboard')
      setRoute('home')
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : 'Failed to select Jellyfin profile.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await api.saveSettings(config)
      setConfig(response.config)
      await refreshBaseData()
      setNotice('Settings saved and services refreshed.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRequest(card: MediaCard) {
    if (!card.tmdbId) return

    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (card.mediaType === 'movie') {
        await api.requestMovie(card.tmdbId)
      } else {
        await api.requestSeries(card.tmdbId)
      }
      if (route !== 'downloads' && route !== 'settings') {
        await loadHub(route as HubPageResponse['page'], { silent: true })
      }
      setNotice(`${card.title} sent to ${card.mediaType === 'movie' ? 'Radarr' : 'Sonarr'}.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to send request.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteDownload(id: string) {
    setDownloadDeleteId(id)
    setError('')
    setNotice('')
    try {
      await api.deleteDownload({ id })
      const nextDownloads = await api.getDownloads()
      setDownloads(nextDownloads)
      setNotice('Download removed from the queue.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove the download.')
    } finally {
      setDownloadDeleteId('')
    }
  }

  function updateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((current) => ({
      ...current,
      [key]: value,
    }))
  }

  if (authState === 'loading') {
    return <LoadingScreen />
  }

  if (authState === 'setup' || authState === 'login') {
    return (
      <AuthScreen
        busy={busy}
        error={error}
        mode={authState}
        onSubmit={handleAuthSubmit}
        password={password}
        setPassword={setPassword}
      />
    )
  }

  if (entryStage === 'onboarding') {
    return (
      <JellyfinOnboardingScreen
        apiKey={config.jellyfin.apiKey}
        baseUrl={config.jellyfin.baseUrl}
        busy={jellyfinUsersBusy}
        error={error}
        notice={notice}
        onApiKeyChange={(apiKey) =>
          updateConfig('jellyfin', { ...config.jellyfin, apiKey })
        }
        onBaseUrlChange={(baseUrl) =>
          updateConfig('jellyfin', { ...config.jellyfin, baseUrl })
        }
        onLoadUsers={handleLoadJellyfinUsers}
        users={options.jellyfinUsers}
      />
    )
  }

  if (entryStage === 'profiles') {
    return (
      <div className={getEntryTransitionClassName(entryTransitionState)}>
        <ProfileSelectionScreen
          busy={busy}
          currentUserId={config.jellyfin.userId}
          error={error}
          notice={notice}
          onBackToOnboarding={() => void transitionEntryStage('onboarding')}
          onSelectUser={handleSelectJellyfinUser}
          users={options.jellyfinUsers}
        />
      </div>
    )
  }

  const currentJellyfinUser =
    options.jellyfinUsers.find((option) => option.id === config.jellyfin.userId)?.label || 'Media cockpit'
  const currentHub = route !== 'downloads' && route !== 'settings' ? hubPages[route as HubPageResponse['page']] : undefined

  return (
    <div className={`omniarr-app ${getEntryTransitionClassName(entryTransitionState)}`}>
      <Sidebar
        busy={busy}
        connections={connections}
        currentUser={currentJellyfinUser}
        onExitProfile={() => void transitionEntryStage('profiles')}
        route={route}
        setRoute={setRoute}
      />

      <div className="content-shell">
        <main className="content-panel">
          <div className="content-scroll">
            <div className="content-status">
              {notice ? <p className="notice">{notice}</p> : null}
              {error ? <p className="error-banner">{error}</p> : null}
            </div>

            {route === 'downloads' ? <DownloadsPage busyId={downloadDeleteId} downloads={downloads} onDelete={handleDeleteDownload} /> : null}
            {route === 'settings' ? (
              <SettingsView
                busy={busy}
                config={config}
                connections={connections}
                jellyfinUsersBusy={jellyfinUsersBusy}
                onLoadJellyfinUsers={handleLoadJellyfinUsers}
                onSave={handleSaveSettings}
                options={options}
                updateConfig={updateConfig}
              />
            ) : null}
            {route !== 'downloads' && route !== 'settings' ? (
              <HubPageView
                busy={busy}
                hub={currentHub}
                loading={hubLoading}
                onOpenCard={(card, originRect) => setSelectedCard({ card, originRect: originRect ?? null })}
                onRequest={handleRequest}
                route={route}
                tmdbToken={config.tmdb.bearerToken}
              />
            ) : null}
          </div>
        </main>
      </div>

      {selectedCard ? (
        <TitleDetailsModal
          card={selectedCard.card}
          config={config}
          onClose={() => setSelectedCard(null)}
          originRect={selectedCard.originRect}
          onRequest={handleRequest}
        />
      ) : null}
    </div>
  )
}

function getEntryTransitionClassName(state: EntryTransitionState) {
  return state === 'idle' ? 'entry-stage-shell' : `entry-stage-shell is-${state}`
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function Sidebar(props: {
  route: AppRoute
  setRoute: (route: AppRoute) => void
  currentUser: string
  connections: ConnectionStatus[]
  busy: boolean
  onExitProfile: () => void
}) {
  const hasServiceFailure = props.connections.some((connection) => !connection.ok)

  return (
    <aside className="omniarr-sidebar">
      <div className="sidebar-wallpaper" />
      <div className="sidebar-inner">
        <button className="sidebar-profile" onClick={() => startTransition(() => props.setRoute('home'))} type="button">
          <div className="sidebar-avatar">{props.currentUser.slice(0, 1).toUpperCase()}</div>
          <div className="sidebar-profile-copy">
            <strong>{props.currentUser}</strong>
          </div>
        </button>

        <div className="sidebar-links">
          {sidebarItems.map((item) => (
            <button
              className={item.route === props.route ? 'sidebar-link active' : 'sidebar-link'}
              key={item.route}
              onClick={() => startTransition(() => props.setRoute(item.route))}
              type="button"
            >
              <span className="sidebar-link-short" aria-hidden="true">{item.short}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-links">
          {networkSidebarItems.map((item) => (
            <button
              className={item.route === props.route ? 'sidebar-link active' : 'sidebar-link'}
              key={item.route}
              onClick={() => startTransition(() => props.setRoute(item.route))}
              type="button"
            >
              <span className="sidebar-link-short sidebar-network-icon" aria-hidden="true">
                <img alt="" className={item.iconClassName || 'sidebar-network-icon-image'} src={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="ghost-button sidebar-settings" onClick={() => startTransition(() => props.setRoute('settings'))} type="button">
            <span className="door-icon sidebar-action-icon" aria-hidden="true">S</span>
            <span
              className={hasServiceFailure ? 'status-dot down sidebar-settings-status' : 'status-dot ok sidebar-settings-status'}
              title={hasServiceFailure ? 'One or more services are failing.' : 'All services are healthy.'}
            />
            <span>Settings</span>
          </button>
          <button className="ghost-button sidebar-exit" disabled={props.busy} onClick={props.onExitProfile} type="button">
            <span className="door-icon sidebar-action-icon" aria-hidden="true">[]</span>
            <span>Switch user</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-orb" />
      <p>Preparing OmniArr…</p>
    </div>
  )
}

function AuthScreen({
  mode,
  password,
  setPassword,
  onSubmit,
  busy,
  error,
}: {
  mode: 'setup' | 'login'
  password: string
  setPassword: (value: string) => void
  onSubmit: () => Promise<void>
  busy: boolean
  error: string
}) {
  const isPasswordValid = password.trim().length >= 8
  const isSetup = mode === 'setup'

  function handleSubmit() {
    if (busy || !isPasswordValid) {
      return
    }

    void onSubmit()
  }

  return (
    <div className={isSetup ? 'auth-layout' : 'auth-layout auth-layout-login'}>
      <section className={isSetup ? 'auth-panel' : 'auth-panel auth-panel-login'}>
        <div className="auth-panel-shell">
          <p className="eyebrow">{isSetup ? 'First boot' : 'Secure access'}</p>
          <h1>{isSetup ? 'Create your master password' : 'Sign in to OmniArr'}</h1>
          <p className="auth-copy">
            {isSetup
              ? 'This password protects the session and encrypts service settings on the server.'
              : 'Unlock the server session with your master password.'}
          </p>
        </div>
        <div className="auth-form-card">
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmit()
            }}
          >
            <label>
              {isSetup ? 'Master password' : 'Password'}
              <input
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                className="input"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSetup ? 'At least 8 characters' : ''}
                type="password"
                value={password}
              />
            </label>
            {isSetup && !isPasswordValid && password.length > 0 ? <p className="helper-text">Password must be at least 8 non-space characters.</p> : null}
            {error ? <p className="error-banner">{error}</p> : null}
            {busy ? <p className="notice">Contacting backend…</p> : null}
            <button className="primary-button" disabled={busy || !isPasswordValid} type="submit">
              {busy ? 'Processing…' : isSetup ? 'Initialize' : 'Sign in'}
            </button>
          </form>
        </div>
      </section>

      {isSetup ? (
        <section className="auth-visual">
          <div className="auth-wallpaper" />
          <div className="glass-card">
            <p className="eyebrow">Migration</p>
            <ul className="feature-list">
              <li>Server-side session auth</li>
              <li>Encrypted persisted settings</li>
              <li>Jellyfin, Sonarr and Radarr</li>
              <li>Rebuilt React UI with shared layout</li>
            </ul>
          </div>
        </section>
      ) : (
        <section className="auth-visual auth-visual-login" aria-hidden="true">
          <div className="auth-wallpaper" />
        </section>
      )}
    </div>
  )
}

function JellyfinOnboardingScreen(props: {
  baseUrl: string
  apiKey: string
  users: SelectOption[]
  busy: boolean
  error: string
  notice: string
  onBaseUrlChange: (value: string) => void
  onApiKeyChange: (value: string) => void
  onLoadUsers: () => Promise<void>
}) {
  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <p className="eyebrow">Jellyfin setup</p>
        <h1>Connect your server</h1>
        <p className="auth-copy">
          Enter your Jellyfin URL and API key to load the available profiles before entering the dashboard.
        </p>
        <div className="auth-form">
          <label>
            Jellyfin URL
            <input className="input" onChange={(event) => props.onBaseUrlChange(event.target.value)} value={props.baseUrl} />
          </label>
          <label>
            API key
            <input className="input" onChange={(event) => props.onApiKeyChange(event.target.value)} value={props.apiKey} />
          </label>
          {props.error ? <p className="error-banner">{props.error}</p> : null}
          {props.notice ? <p className="notice">{props.notice}</p> : null}
          <button className="primary-button" disabled={props.busy || !props.baseUrl.trim() || !props.apiKey.trim()} onClick={() => void props.onLoadUsers()} type="button">
            {props.busy ? 'Loading users…' : 'Load Jellyfin users'}
          </button>
        </div>
      </section>
      <section className="auth-visual">
        <div className="auth-wallpaper" />
        <div className="glass-card">
          <p className="eyebrow">Profiles</p>
          <div className="profile-grid compact">
            {props.users.map((user) => (
              <div className="profile-card static" key={user.id}>
                <div className="profile-avatar">{user.label.slice(0, 1).toUpperCase()}</div>
                <strong>{user.label}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function ProfileSelectionScreen(props: {
  users: SelectOption[]
  currentUserId: string
  busy: boolean
  error: string
  notice: string
  onSelectUser: (userId: string) => Promise<void>
  onBackToOnboarding: () => void
}) {
  return (
    <div className="profiles-layout">
      <div className="profiles-header">
        <p className="eyebrow">Profiles</p>
        <h1>Who&apos;s watching?</h1>
        {props.error ? <p className="error-banner">{props.error}</p> : null}
        {props.notice ? <p className="notice">{props.notice}</p> : null}
      </div>
      <div className="profile-grid">
        {props.users.map((user) => (
          <button
            className={user.id === props.currentUserId ? 'profile-card active' : 'profile-card'}
            disabled={props.busy}
            key={user.id}
            onClick={() => void props.onSelectUser(user.id)}
            type="button"
          >
            <div className="profile-avatar">{user.label.slice(0, 1).toUpperCase()}</div>
            <strong>{user.label}</strong>
          </button>
        ))}
      </div>
      <div className="profiles-actions">
        <button className="ghost-button" onClick={props.onBackToOnboarding} type="button">
          Edit Jellyfin connection
        </button>
      </div>
    </div>
  )
}

function HubPageView(props: {
  route: AppRoute
  hub?: HubPageResponse
  loading: boolean
  onRequest: (card: MediaCard) => Promise<void>
  onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void
  busy: boolean
  tmdbToken: string
}) {
  if (props.loading) {
    return <LoadingHub />
  }

  if (!props.hub) {
    return (
      <EmptyState
        copy="This section could not be loaded. Check the service URLs and the current Jellyfin profile."
        title="Section unavailable"
      />
    )
  }

  const hasHero = props.hub.hero.length > 0
  const hasSections = props.hub.sections.some((section) => section.items.length > 0)
  const hasContinueWatching = Boolean(props.hub.continueWatching?.length)

  if (!hasHero && !hasSections && !hasContinueWatching) {
    return (
      <EmptyState
        copy="Check Jellyfin, TMDb and the selected profile. This page is connected, but it has no media to display yet."
        title="No media available"
      />
    )
  }

  return (
    <div className="hub-page">
      <HeroShowcase hero={props.hub.hero} onOpenCard={props.onOpenCard} tmdbToken={props.tmdbToken} />
      {props.hub.continueWatching?.length ? (
        <SectionCarousel busy={props.busy} onOpenCard={props.onOpenCard} onRequest={props.onRequest} section={{ id: 'continue', title: 'Continue Watching', style: 'episode', items: props.hub.continueWatching }} />
      ) : null}
      {props.hub.sections.map((section) => (
        <SectionCarousel busy={props.busy} key={section.id} onOpenCard={props.onOpenCard} onRequest={props.onRequest} section={section} />
      ))}
    </div>
  )
}

function HeroShowcase({ hero, onOpenCard, tmdbToken }: { hero: MediaCard[]; onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void; tmdbToken: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeLogoUrl, setActiveLogoUrl] = useState('')
  const logoCacheRef = useRef(new Map<string, string>())

  useEffect(() => {
    setActiveIndex((current) => (hero.length ? Math.min(current, hero.length - 1) : 0))
  }, [hero])

  useEffect(() => {
    if (hero.length <= 1) {
      return
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % hero.length)
    }, 9000)

    return () => window.clearInterval(interval)
  }, [hero])

  const featured = hero[activeIndex]

  useEffect(() => {
    if (!featured?.tmdbId) {
      setActiveLogoUrl('')
      return
    }

    const mediaType = featured.mediaType === 'movie' ? 'movie' : featured.mediaType === 'tv' || featured.mediaType === 'series' ? 'tv' : ''
    if (!mediaType) {
      setActiveLogoUrl('')
      return
    }

    let cancelled = false
    const cacheKey = `${mediaType}:${featured.tmdbId}`
    const cachedLogoUrl = logoCacheRef.current.get(cacheKey)
    if (cachedLogoUrl !== undefined) {
      setActiveLogoUrl(cachedLogoUrl)
      return
    }

    const fetchImages = tmdbToken
      ? fetch(`https://api.themoviedb.org/3/${mediaType}/${featured.tmdbId}/images`, {
          headers: {
            Authorization: `Bearer ${tmdbToken}`,
          },
        })
      : fetch(`/api/tmdb/logo?tmdbId=${featured.tmdbId}&mediaType=${mediaType}`)

    void fetchImages
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load logo')
        }

        return response.json() as Promise<{
          logos?: Array<{ file_path: string; iso_639_1: string | null }>
          backdrops?: Array<{ file_path: string; iso_639_1: string | null }>
        }>
      })
      .then((payload) => {
        if (!cancelled) {
          const englishLogos = payload.logos?.filter((logo) => logo.iso_639_1 === 'en') || []
          const logo = englishLogos[0] || payload.logos?.[0]
          const nextLogoUrl = logo?.file_path ? `https://image.tmdb.org/t/p/original${logo.file_path}` : ''
          logoCacheRef.current.set(cacheKey, nextLogoUrl)
          setActiveLogoUrl(nextLogoUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          logoCacheRef.current.set(cacheKey, '')
          setActiveLogoUrl('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [featured])

  if (!featured) {
    return (
      <div className="hero-showcase empty">
        <div className="hero-copy">
          <span className="badge">Library</span>
          <h1>No featured media yet</h1>
          <p>Once Jellyfin and TMDb return content, featured titles will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <section
      className="hero-showcase"
      onClick={() => onOpenCard(featured)}
    >
      <div className="hero-media" aria-hidden="true">
        {hero.slice(0, 6).map((card, index) => (
          <div
            className={index === activeIndex ? 'hero-slide active' : 'hero-slide'}
            key={card.id}
            style={resolveHeroSlideStyle(card)}
          />
        ))}
      </div>
      <div className="hero-overlay" />
      <div className="hero-content">
        <div className="hero-copy">
          {activeLogoUrl ? (
            <img
              alt={featured.title}
              className="hero-logo-image"
              loading="eager"
              src={activeLogoUrl}
            />
          ) : (
            <div className="hero-logo" aria-label={featured.title}>{featured.title}</div>
          )}
        </div>
      </div>
      <div className="hero-dots">
        {hero.slice(0, 6).map((card, index) => (
          <button
            aria-label={`Show ${card.title}`}
            className={index === activeIndex ? 'hero-dot active' : 'hero-dot'}
            key={card.id}
            onClick={(event) => {
              event.stopPropagation()
              setActiveIndex(index)
            }}
            type="button"
          />
        ))}
      </div>
    </section>
  )
}

function resolveHeroSlideStyle(card: MediaCard | undefined) {
  if (!card) {
    return undefined
  }

  const slideImage = card.backdropUrl || card.posterUrl

  return slideImage ? { backgroundImage: `url("${slideImage}")` } : undefined
}

function getSeasonEpisodes(
  episodes: TitleDetailsEpisode[],
  seasonId: string
): TitleDetailsEpisode[] {
  return episodes.filter((episode) => episode.seasonId === seasonId)
}

function findSeasonAnchorElement(list: HTMLDivElement, seasonId: string) {
  return list.querySelector<HTMLElement>(`[data-season-id="${CSS.escape(seasonId)}"]`)
}

function findEpisodeElement(list: HTMLDivElement, episodeId: string) {
  return list.querySelector<HTMLElement>(`[data-episode-id="${CSS.escape(episodeId)}"]`)
}

function centerEpisodeInList(list: HTMLDivElement, episodeId: string, behavior: ScrollBehavior) {
  const targetEpisode = findEpisodeElement(list, episodeId)
  if (!targetEpisode) {
    return false
  }

  const centeredLeft = Math.max(0, targetEpisode.offsetLeft - (list.clientWidth - targetEpisode.offsetWidth) / 2)
  list.scrollTo({ left: centeredLeft, behavior })
  return true
}

function cacheHubPage(
  current: Partial<Record<HubPageResponse['page'], HubPageResponse>>,
  page: HubPageResponse['page'],
  hub: HubPageResponse
): Partial<Record<HubPageResponse['page'], HubPageResponse>> {
  const next = { ...current, [page]: hub }
  const pages = Object.keys(next) as HubPageResponse['page'][]
  if (pages.length <= MAX_CACHED_HUB_PAGES) {
    return next
  }

  const trimmed: Partial<Record<HubPageResponse['page'], HubPageResponse>> = {}
  pages.slice(-MAX_CACHED_HUB_PAGES).forEach((cachedPage) => {
    trimmed[cachedPage] = next[cachedPage]
  })
  return trimmed
}

function SectionCarousel(props: {
  section: HubPageResponse['sections'][number]
  onRequest: (card: MediaCard) => Promise<void>
  onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void
  busy: boolean
}) {
  if (!props.section.items.length) return null

  return (
    <section className={props.section.id === 'continue' ? 'carousel-row continue-row' : 'carousel-row'}>
      <div className="carousel-title">{props.section.title}</div>
      <div className="carousel-section">
        <div className="carousel-track">
          {props.section.items.map((card) => (
            <MediaTile busy={props.busy} card={card} isContinueWatching={props.section.id === 'continue'} key={card.id} onOpenCard={props.onOpenCard} onRequest={props.onRequest} styleType={props.section.style || 'landscape'} />
          ))}
        </div>
      </div>
    </section>
  )
}

function MediaTile(props: {
  card: MediaCard
  isContinueWatching: boolean
  styleType: 'poster' | 'landscape' | 'profile' | 'genre' | 'network' | 'episode'
  busy: boolean
  onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void
  onRequest: (card: MediaCard) => Promise<void>
}) {
  const imageUrl = props.styleType === 'landscape' || props.styleType === 'episode'
    ? (props.card.backdropUrl || props.card.posterUrl)
    : props.card.posterUrl
  const continueEpisodeMeta = props.isContinueWatching ? parseContinueEpisodeMeta(props.card) : null
  const tileClassName = [
    'media-tile',
    props.styleType,
    props.isContinueWatching ? 'continue-tile' : '',
    props.isContinueWatching && props.card.progress ? 'has-progress' : '',
  ].filter(Boolean).join(' ')

  return (
    <article className={tileClassName}>
      <button
        className="media-art media-trigger"
        onClick={(event) => {
          const tile = event.currentTarget.closest('.media-tile') as HTMLElement | null
          props.onOpenCard(props.card, tile ? captureOriginRect(tile) : captureOriginRect(event.currentTarget))
        }}
        type="button"
      >
        {imageUrl ? <img alt={props.card.title} loading="lazy" src={imageUrl} /> : <div className="media-fallback" />}
        {continueEpisodeMeta ? (
          <div className="continue-episode-meta">
            <span className="continue-episode-meta-primary">{`Season ${continueEpisodeMeta.seasonNumber}`}</span>
            <span className="continue-episode-meta-secondary">{`Episode ${continueEpisodeMeta.episodeNumber}`}</span>
          </div>
        ) : null}
        {props.card.hoverLabel && !continueEpisodeMeta ? <div className="media-hover-label">{props.card.hoverLabel}</div> : null}
        {props.card.progress ? <div className="tile-progress"><div className="tile-progress-fill" style={{ width: `${props.card.progress}%` }} /></div> : null}
      </button>
    </article>
  )
}

function TitleDetailsModal(props: {
  card: MediaCard
  config: AppConfig
  onClose: () => void
  originRect: ModalOriginRect | null
  onRequest: (card: MediaCard) => Promise<void>
}) {
  const [details, setDetails] = useState<TitleDetailsResponse | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsError, setDetailsError] = useState('')
  const [activeSeasonId, setActiveSeasonId] = useState<string | undefined>(undefined)
  const [episodeWatchBusyId, setEpisodeWatchBusyId] = useState<string | null>(null)
  const [seasonActionBusy, setSeasonActionBusy] = useState<'download' | 'delete' | null>(null)
  const [playerTarget, setPlayerTarget] = useState<{ id: string; title: string } | null>(null)
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false)
  const [episodeScrollState, setEpisodeScrollState] = useState({ canScrollLeft: false, canScrollRight: false })
  const [transitionState, setTransitionState] = useState<'opening' | 'open' | 'closing'>(
    props.originRect ? 'opening' : 'open'
  )
  const [transitionStyle, setTransitionStyle] = useState<CSSProperties | undefined>(undefined)
  const closeTimeoutRef = useRef<number | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const episodeListRef = useRef<HTMLDivElement | null>(null)
  const pendingSeasonScrollRef = useRef<string | null>(null)
  const initialEpisodeFocusKeyRef = useRef('')
  const hasUserScrolledEpisodeListRef = useRef(false)
  const initialEpisodeListScrollLeftRef = useRef(0)

  useLayoutEffect(() => {
    if (!props.originRect || !modalRef.current) {
      setTransitionState('open')
      setTransitionStyle(undefined)
      return
    }

    const modalRect = modalRef.current.getBoundingClientRect()
    const scaleX = props.originRect.width / modalRect.width
    const scaleY = props.originRect.height / modalRect.height
    const translateX = props.originRect.left - modalRect.left
    const translateY = props.originRect.top - modalRect.top

    setTransitionStyle({
      ['--title-modal-from-x' as '--title-modal-from-x']: `${translateX}px`,
      ['--title-modal-from-y' as '--title-modal-from-y']: `${translateY}px`,
      ['--title-modal-from-scale-x' as '--title-modal-from-scale-x']: `${scaleX}`,
      ['--title-modal-from-scale-y' as '--title-modal-from-scale-y']: `${scaleY}`,
    } as CSSProperties)

    let frameA = 0
    let frameB = 0
    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        setTransitionState('open')
      })
    })

    return () => {
      window.cancelAnimationFrame(frameA)
      window.cancelAnimationFrame(frameB)
    }
  }, [props.card.id, props.originRect])

  useEffect(() => () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    setDetails(null)
    setDetailsLoading(true)
    setDetailsError('')
    setActiveSeasonId(undefined)
    setEpisodeWatchBusyId(null)
    setSeasonActionBusy(null)
    setPlayerTarget(null)
    setIsOverviewExpanded(false)
    pendingSeasonScrollRef.current = null
    initialEpisodeFocusKeyRef.current = ''
    hasUserScrolledEpisodeListRef.current = false
    initialEpisodeListScrollLeftRef.current = 0
  }, [props.card.id])

  function updateEpisodeInCaches(episodeId: string, updater: (episode: NonNullable<TitleDetailsResponse['episodes']>[number]) => NonNullable<TitleDetailsResponse['episodes']>[number]) {
    setDetails((current) => current && current.episodes.some((episode) => episode.id === episodeId)
      ? {
          ...current,
          episodes: current.episodes.map((episode) => episode.id === episodeId ? updater(episode) : episode)
        }
      : current)
  }

  async function refreshSeasonState(targetSeasonId?: string) {
    const refreshSeasonId = targetSeasonId || activeSeasonId || details?.selectedSeasonId
    const nextDetails = await api.getTitleDetails(props.card, refreshSeasonId)
    setDetails(nextDetails)
    setDetailsError('')
    setActiveSeasonId(refreshSeasonId || nextDetails.selectedSeasonId)
  }

  useEffect(() => {
    let cancelled = false
    setDetailsLoading(true)
    setDetailsError('')

    void api.getTitleDetails(props.card)
      .then((nextDetails) => {
        if (cancelled) return
        setDetails(nextDetails)
        setActiveSeasonId(nextDetails.selectedSeasonId)
      })
      .catch((error) => {
        if (cancelled) return
        setDetailsError(error instanceof Error ? error.message : 'Failed to load title details.')
      })
      .finally(() => {
        if (cancelled) return
        setDetailsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [props.card])

  const seasonValue = activeSeasonId ?? details?.selectedSeasonId ?? ''

  useEffect(() => {
    const list = episodeListRef.current
    const targetSeasonId = pendingSeasonScrollRef.current
    if (!list || !targetSeasonId) {
      return
    }

    const targetEpisode = findSeasonAnchorElement(list, targetSeasonId)
    if (!targetEpisode) {
      return
    }

    list.scrollTo({
      left: Math.max(0, targetEpisode.offsetLeft - (list.clientWidth - targetEpisode.offsetWidth) / 2),
      behavior: 'smooth',
    })
    pendingSeasonScrollRef.current = null
  }, [details, seasonValue])

  useLayoutEffect(() => {
    const list = episodeListRef.current
    const playTargetId = details?.playTargetId
    if (!list || !playTargetId || pendingSeasonScrollRef.current) {
      return
    }

    const focusKey = `${props.card.id}:${playTargetId}`
    if (initialEpisodeFocusKeyRef.current === focusKey) {
      return
    }

    if (!centerEpisodeInList(list, playTargetId, 'auto')) {
      return
    }

    initialEpisodeListScrollLeftRef.current = list.scrollLeft
    initialEpisodeFocusKeyRef.current = focusKey
  }, [details?.playTargetId, props.card.id])

  useEffect(() => {
    const list = episodeListRef.current
    if (!list || detailsLoading || details?.mediaType !== 'series') {
      setEpisodeScrollState({ canScrollLeft: false, canScrollRight: false })
      return
    }

    const syncScrollState = () => {
      const maxScrollLeft = list.scrollWidth - list.clientWidth
      setEpisodeScrollState({
        canScrollLeft: list.scrollLeft > 8,
        canScrollRight: maxScrollLeft - list.scrollLeft > 8,
      })

      if (
        !hasUserScrolledEpisodeListRef.current
        && Math.abs(list.scrollLeft - initialEpisodeListScrollLeftRef.current) > 32
      ) {
        hasUserScrolledEpisodeListRef.current = true
      }

      const viewportLeft = list.scrollLeft
      const viewportRight = viewportLeft + list.clientWidth
      const coverageBySeason = new Map<string, number>()
      const boundsBySeason = new Map<string, { left: number; right: number }>()
      const cards = list.querySelectorAll<HTMLElement>('[data-season-id]')

      for (const card of cards) {
        const seasonId = card.dataset.seasonId
        if (!seasonId) continue

        const cardLeft = card.offsetLeft
        const cardRight = cardLeft + card.offsetWidth
        const currentBounds = boundsBySeason.get(seasonId)
        boundsBySeason.set(seasonId, {
          left: currentBounds ? Math.min(currentBounds.left, cardLeft) : cardLeft,
          right: currentBounds ? Math.max(currentBounds.right, cardRight) : cardRight,
        })

        const visibleWidth = Math.min(cardRight, viewportRight) - Math.max(cardLeft, viewportLeft)
        if (visibleWidth <= 0) continue

        coverageBySeason.set(seasonId, (coverageBySeason.get(seasonId) || 0) + visibleWidth)
      }

      let dominantSeasonId = seasonValue
      let dominantCoverage = -1
      for (const [seasonId, coverage] of coverageBySeason.entries()) {
        if (coverage > dominantCoverage) {
          dominantCoverage = coverage
          dominantSeasonId = seasonId
        }
      }

      const currentCoverage = coverageBySeason.get(activeSeasonId || seasonValue) || 0
      const coverageThreshold = Math.max(currentCoverage * SEASON_DOMINANCE_SWITCH_RATIO, SEASON_DOMINANCE_SWITCH_MIN_PX)

      if (
        hasUserScrolledEpisodeListRef.current
        && !pendingSeasonScrollRef.current
        && dominantSeasonId
        && dominantSeasonId !== activeSeasonId
        && dominantCoverage - currentCoverage > coverageThreshold
      ) {
        setActiveSeasonId(dominantSeasonId)
      }
    }

    syncScrollState()
    list.addEventListener('scroll', syncScrollState, { passive: true })
    window.addEventListener('resize', syncScrollState)

    return () => {
      list.removeEventListener('scroll', syncScrollState)
      window.removeEventListener('resize', syncScrollState)
    }
  }, [activeSeasonId, details, detailsLoading, seasonValue])

  const canRequest = Boolean(props.card.tmdbId && props.card.mediaType !== 'mixed')
  const playId = details?.playTargetId || details?.providerId || props.card.providerId
  const isAvailableInJellyfin = details?.availableInJellyfin ?? Boolean(props.card.providerId)
  const canPlay = Boolean(isAvailableInJellyfin && playId && props.config.jellyfin.baseUrl)
  const backgroundImage = details?.backdropUrl || props.card.backdropUrl || props.card.posterUrl
  const logoUrl = details?.logoUrl || props.card.logoUrl
  const displayTitle = details?.title || props.card.title
  const displaySubtitle = details?.subtitle || props.card.subtitle
  const displayOverview = details?.overview || props.card.overview || 'No details available yet.'
  const displayYear = props.card.releaseDate?.slice(0, 4)
    || props.card.firstAirDate?.slice(0, 4)
    || displaySubtitle.match(/\b(19|20)\d{2}\b/)?.[0]
    || ''
  const truncatedOverview = truncateOverview(displayOverview, 260)
  const shouldShowOverviewToggle = truncatedOverview !== displayOverview
  const jellyfinPlayerUrl = playerTarget && props.config.jellyfin.baseUrl
    ? buildJellyfinPlayerUrl(props.config.jellyfin.baseUrl, playerTarget.id)
    : ''
  const playLabel = playerTarget?.title || details?.episodes.find((episode) => episode.id === playId)?.title || displayTitle
  const activeSeasonMeta = details?.seasons.find((season) => season.id === seasonValue)
  const activeSeasonDetails = details && seasonValue
    ? { episodes: getSeasonEpisodes(details.episodes, seasonValue) }
    : null
  const activeSeasonNumber = activeSeasonMeta?.seasonNumber
  const activeSeasonDownloadStatus = activeSeasonMeta?.downloadStatus || 'idle'
  const currentSeasonIndex = details?.seasons.findIndex((season) => season.id === seasonValue) ?? -1
  const resolvedSeasonIndex = currentSeasonIndex >= 0 ? currentSeasonIndex : 0
  const hasPreviousSeason = Boolean(details?.seasons.length && resolvedSeasonIndex > 0)
  const hasNextSeason = Boolean(details?.seasons.length && resolvedSeasonIndex < details.seasons.length - 1)
  const visibleEpisodes = details
    ? details.episodes
    : []
  const canDownloadSeasonAction = Boolean(
    activeSeasonDownloadStatus === 'processing'
    || activeSeasonDownloadStatus === 'downloading'
    || (details?.sonarrSeriesId && typeof activeSeasonNumber === 'number' && activeSeasonNumber > 0)
    || activeSeasonMeta?.canDownload
    || (canRequest && !details?.sonarrSeriesId && typeof activeSeasonNumber === 'number')
  )
  const canDeleteSeasonAction = Boolean(activeSeasonMeta?.canDelete)
  const shouldShowDownloadSeasonAction = canDownloadSeasonAction && !canDeleteSeasonAction

  useEffect(() => {
    if (!details || details.mediaType !== 'series') {
      return
    }

    if (activeSeasonDownloadStatus !== 'processing' && activeSeasonDownloadStatus !== 'downloading') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshSeasonState(seasonValue || undefined)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeSeasonDownloadStatus, details, seasonValue])

  function handleRequestClose() {
    if (!props.originRect || transitionState === 'closing') {
      props.onClose()
      return
    }

    setTransitionState('closing')
    closeTimeoutRef.current = window.setTimeout(() => {
      props.onClose()
    }, 680)
  }

  function scrollEpisodes(direction: 'left' | 'right') {
    const list = episodeListRef.current
    if (!list) return

    const distance = Math.max(list.clientWidth * EPISODE_SCROLL_DISTANCE_RATIO, 320)
    list.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    })
  }

  function changeSeason(offset: -1 | 1) {
    if (!details?.seasons.length) {
      return
    }

    const nextSeason = details.seasons[resolvedSeasonIndex + offset]
    if (!nextSeason) {
      return
    }
    pendingSeasonScrollRef.current = nextSeason.id
    setActiveSeasonId(nextSeason.id)
  }

  function handleSeasonSelectChange(nextSeasonId: string) {
    pendingSeasonScrollRef.current = nextSeasonId || null
    setActiveSeasonId(nextSeasonId || undefined)
  }

  function handleEpisodeWatchToggle(
    event: MouseEvent<HTMLButtonElement>,
    episodeId: string,
    watched: boolean | undefined,
    progress: number | undefined,
    playbackPositionTicks: number | undefined
  ) {
    event.preventDefault()
    event.stopPropagation()

    const nextWatched = !watched
    setEpisodeWatchBusyId(episodeId)
    updateEpisodeInCaches(episodeId, (episode) => ({
      ...episode,
      watched: nextWatched,
      progress: nextWatched ? undefined : 0,
      playbackPositionTicks: nextWatched ? undefined : 0,
    }))

    void api.setEpisodeWatchState({ episodeId, watched: nextWatched })
      .catch(() => {
        updateEpisodeInCaches(episodeId, (episode) => ({
          ...episode,
          watched: watched ?? false,
          progress,
          playbackPositionTicks,
        }))
      })
      .finally(() => {
        setEpisodeWatchBusyId((current) => current === episodeId ? null : current)
      })
  }

  async function handleSeasonDownload() {
    if (typeof activeSeasonNumber !== 'number') {
      return
    }

    if (activeSeasonDownloadStatus === 'processing' || activeSeasonDownloadStatus === 'downloading') {
      return
    }

    setSeasonActionBusy('download')
    setDetailsError('')
    try {
      if (details?.sonarrSeriesId) {
        await api.requestSeason({
          seriesId: details.sonarrSeriesId,
          seasonNumber: activeSeasonNumber,
        })
      } else {
        await props.onRequest(props.card)
      }
      await refreshSeasonState(seasonValue || undefined)
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Failed to queue the season download.')
    } finally {
      setSeasonActionBusy(null)
    }
  }

  async function handleSeasonDelete() {
    if (!details?.sonarrSeriesId || typeof activeSeasonNumber !== 'number') {
      return
    }

    if (!window.confirm(`Delete downloaded files for Season ${activeSeasonNumber}?`)) {
      return
    }

    setSeasonActionBusy('delete')
    setDetailsError('')
    try {
      await api.deleteSeason({
        seriesId: details.sonarrSeriesId,
        seasonNumber: activeSeasonNumber,
      })
      await refreshSeasonState(seasonValue || undefined)
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Failed to delete season files.')
    } finally {
      setSeasonActionBusy(null)
    }
  }

  return (
    <div className={transitionState === 'closing' ? 'modal-backdrop is-closing' : 'modal-backdrop'} onClick={handleRequestClose} role="presentation">
      <div
        className={
          transitionStyle
            ? `title-modal title-details-modal title-details-modal-transition is-${transitionState}`
            : 'title-modal title-details-modal'
        }
        onClick={(event) => event.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        style={transitionStyle}
      >
        {detailsLoading && !details ? (
          <div className="title-details-loading-screen" role="status" aria-live="polite">
            <div className="title-details-spinner" aria-hidden="true" />
            <p>Loading details…</p>
          </div>
        ) : null}
        <div className={playerTarget && jellyfinPlayerUrl ? 'title-details-modal-content has-embedded-player' : 'title-details-modal-content'}>
          {playerTarget && jellyfinPlayerUrl ? (
            <div className="title-embedded-player">
              <div className="title-player-topbar title-player-topbar-embedded">
                <button aria-label="Back to details" className="title-player-inline-control" onClick={() => setPlayerTarget(null)} type="button">
                  <MenuGlyph />
                </button>
                <div className="title-player-topbar-brand" aria-hidden="true">
                  {logoUrl ? (
                    <img alt="" className="title-player-topbar-logo" src={logoUrl} />
                  ) : (
                    <span className="title-player-topbar-title">{displayTitle}</span>
                  )}
                </div>
                <button aria-label="Close" className="title-player-inline-control title-player-inline-close" onClick={handleRequestClose} type="button">×</button>
              </div>
              <div className="title-player-frame-shell">
                <iframe
                  allow="autoplay; fullscreen; encrypted-media"
                  className="title-player-frame title-player-frame-embedded"
                  src={jellyfinPlayerUrl}
                  title={`${playLabel} player`}
                />
              </div>
            </div>
          ) : (
            <div className="title-details-hero" style={backgroundImage ? { backgroundImage: `url("${backgroundImage}")` } : undefined}>
              <div className="title-details-darken" />
              <button aria-label="Close" className="modal-close omniarr-modal-close" onClick={handleRequestClose} type="button">×</button>
            </div>
          )}

          <div className={playerTarget && jellyfinPlayerUrl ? 'title-details-body has-embedded-player' : 'title-details-body'}>
            <div className="title-details-shell">
              <div className="title-details-primary">
                {detailsError ? <p className="error-banner">{detailsError}</p> : null}
                {playerTarget && jellyfinPlayerUrl ? null : (
                <div className="title-details-summary">
                  <div className="title-details-hero-heading">
                    {logoUrl ? (
                      <img alt={displayTitle} className="title-details-logo" src={logoUrl} />
                    ) : (
                      <h2 className="title-details-title">{displayTitle}</h2>
                    )}
                  </div>
                  <div className="title-details-summary-content">
                    <p className="title-details-overview">
                      {isOverviewExpanded ? displayOverview : truncatedOverview}
                      {shouldShowOverviewToggle ? (
                        <>
                          {' '}
                          <button
                            className="title-details-overview-toggle"
                            onClick={() => setIsOverviewExpanded((current) => !current)}
                            type="button"
                          >
                            {isOverviewExpanded ? 'less' : 'more'}
                          </button>
                        </>
                      ) : null}
                    </p>
                    <div className="title-details-summary-header">
                      {canPlay ? (
                        <button className="secondary-button title-action-button title-action-button-play" onClick={() => setPlayerTarget({ id: playId!, title: playLabel })} type="button">
                          <PlayGlyph />
                          <span>Play</span>
                        </button>
                      ) : canRequest ? (
                        <button className="secondary-button title-action-button" onClick={() => void props.onRequest(props.card)} type="button">
                          <DownloadGlyph />
                          <span>Request</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {displayYear ? <p className="title-details-year">{displayYear}</p> : null}
                </div>
                )}
                {details?.mediaType === 'series' ? (
                  <div className="title-seasons-panel">
                    <div className="title-seasons-header">
                      <div
                        className="title-season-strip"
                      >
                        {hasPreviousSeason ? (
                          <button
                            aria-label="Previous season"
                            className="title-season-nav"
                            onClick={() => changeSeason(-1)}
                            type="button"
                          />
                        ) : null}
                        {details.seasons.length ? (
                          <label className="title-season-selector">
                            <span className="title-season-kicker">Season</span>
                            <select
                              className="title-season-select"
                              onChange={(event) => handleSeasonSelectChange(event.target.value)}
                              value={seasonValue}
                            >
                              {details.seasons.map((season) => (
                                <option key={season.id} value={season.id}>
                                  {season.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <div className="title-season-divider" aria-hidden="true" />
                        <div className="title-season-badge">
                          <strong>{activeSeasonDetails?.episodes.length ?? activeSeasonMeta?.episodeCount ?? details.episodes.length}</strong>
                          <span>{(activeSeasonDetails?.episodes.length ?? activeSeasonMeta?.episodeCount ?? details.episodes.length) === 1 ? 'episode' : 'episodes'}</span>
                        </div>
                          {shouldShowDownloadSeasonAction || canDeleteSeasonAction ? (
                            <div className="title-season-actions">
                              {shouldShowDownloadSeasonAction || activeSeasonMeta?.isDownloading ? <div className="title-season-divider title-season-action-divider" aria-hidden="true" /> : null}
                              {shouldShowDownloadSeasonAction || activeSeasonMeta?.isDownloading ? (
                                activeSeasonDownloadStatus === 'downloading' ? (
                                  <div
                                    aria-label="Season downloading"
                                      className="title-season-progress"
                                      role="img"
                                      title={activeSeasonMeta?.downloadLabel || 'Downloading'}
                                    >
                                      <div
                                        className="title-season-progress-bar"
                                        style={{ width: `${activeSeasonMeta?.downloadProgress || 0}%` }}
                                      />
                                    </div>
                                  ) : activeSeasonDownloadStatus === 'processing' ? (
                                    <div
                                      aria-label="Season processing"
                                      className="title-season-processing"
                                      role="img"
                                      title={activeSeasonMeta?.downloadLabel || 'Processing'}
                                    >
                                      <span className="title-season-processing-spinner" aria-hidden="true" />
                                    </div>
                                  ) : (
                                    <button
                                      aria-label="Download season"
                                      className="title-season-action"
                                      disabled={seasonActionBusy === 'download'}
                                      onClick={() => void handleSeasonDownload()}
                                      type="button"
                                    >
                                      <DownloadGlyph />
                                    </button>
                                  )
                                ) : null}
                                {canDeleteSeasonAction ? (
                                  <div className="title-season-divider title-season-action-divider" aria-hidden="true" />
                                ) : null}
                                {canDeleteSeasonAction ? (
                                  <button
                                    aria-label="Delete season files"
                                    className="title-season-action title-season-action-delete"
                                    disabled={seasonActionBusy === 'delete'}
                                    onClick={() => void handleSeasonDelete()}
                                    type="button"
                                  >
                                    <TrashGlyph />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                        {hasNextSeason ? (
                          <button
                            aria-label="Next season"
                            className="title-season-nav next"
                            onClick={() => changeSeason(1)}
                            type="button"
                          />
                        ) : null}
                      </div>
                    </div>
                      <div
                        className={[
                          'episode-dock',
                          episodeScrollState.canScrollLeft ? 'show-left-fade' : '',
                          episodeScrollState.canScrollRight ? 'show-right-fade' : '',
                        ].filter(Boolean).join(' ')}
                      >
                      {episodeScrollState.canScrollLeft ? (
                        <button
                          aria-label="Scroll episodes left"
                          className="episode-dock-arrow left"
                          onClick={() => scrollEpisodes('left')}
                          type="button"
                        />
                      ) : null}
                      {episodeScrollState.canScrollRight ? (
                        <button
                          aria-label="Scroll episodes right"
                          className="episode-dock-arrow right"
                          onClick={() => scrollEpisodes('right')}
                          type="button"
                        />
                      ) : null}
                      <div
                        className="episode-list"
                        ref={episodeListRef}
                      >
                        {visibleEpisodes.map((episode) => (
                          <div
                            className={[
                              'episode-card',
                              episode.id === details.playTargetId ? 'is-next-up' : '',
                              episode.id === playerTarget?.id ? 'is-playing' : '',
                              episode.id === details.playTargetId && episode.id === playerTarget?.id ? 'is-playing-next-up' : '',
                              episode.progress && !episode.watched ? 'has-progress' : '',
                              episode.canDownload ? 'is-downloadable' : '',
                              episode.availability === 'downloading' ? 'is-downloading' : '',
                              !episode.availableInJellyfin ? 'is-unavailable' : '',
                            ].filter(Boolean).join(' ')}
                            data-episode-id={episode.id}
                            data-season-id={episode.seasonId}
                            key={`${episode.seasonId}-${episode.id}`}
                            onClick={() => {
                              if (!episode.availableInJellyfin) {
                                return
                              }
                              setPlayerTarget({ id: episode.id, title: episode.title })
                            }}
                            onKeyDown={(event) => {
                              if (!episode.availableInJellyfin) {
                                return
                              }
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setPlayerTarget({ id: episode.id, title: episode.title })
                              }
                            }}
                            role={episode.availableInJellyfin ? 'button' : undefined}
                            tabIndex={episode.availableInJellyfin ? 0 : -1}
                          >
                            <div className="episode-card-art">
                              {episode.progress && !episode.watched ? (
                                <div className="episode-card-progress" aria-hidden="true">
                                  <div className="episode-card-progress-bar" style={{ width: `${episode.progress}%` }} />
                                </div>
                              ) : null}
                              {episode.progress && !episode.watched ? <div className="episode-card-progress-glow" aria-hidden="true" /> : null}
                              {episode.imageUrl ? <img alt={episode.title} loading="lazy" src={episode.imageUrl} /> : <div className="media-fallback" />}
                            </div>
                            <div className="episode-card-copy">
                              <div className="episode-card-title-row">
                                <strong>{episode.title}</strong>
                                <div className="episode-card-state-icons">
                                  {episode.canDownload || episode.availability === 'downloading' ? (
                                    <span
                                      aria-label={episode.availability === 'downloading' ? 'Episode downloading' : 'Episode available to download'}
                                      className={episode.availability === 'downloading' ? 'episode-card-availability is-downloading' : 'episode-card-availability'}
                                      title={episode.availability === 'downloading' ? 'Downloading' : 'Available to download'}
                                    >
                                      <DownloadGlyph />
                                    </span>
                                  ) : null}
                                  {episode.availableInJellyfin ? (
                                    <button
                                      aria-label={episode.watched ? 'Mark episode as unwatched' : 'Mark episode as watched'}
                                      className={episode.watched ? 'episode-card-watch-toggle is-watched' : 'episode-card-watch-toggle'}
                                      disabled={episodeWatchBusyId === episode.id}
                                      onClick={(event) => handleEpisodeWatchToggle(
                                        event,
                                        episode.id,
                                        episode.watched,
                                        episode.progress,
                                        episode.playbackPositionTicks
                                      )}
                                      type="button"
                                    >
                                      <CheckGlyph />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <span>{formatEpisodeMeta(episode.subtitle)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                {details?.cast.length && details.mediaType === 'movie' ? (
                  <div className="title-cast-panel title-cast-panel-inline">
                    <div className="title-cast-header">
                      <h3>Cast & Crew</h3>
                    </div>
                    <div className="title-cast-list">
                      {details.cast.map((member) => (
                        <CastCard key={member.id} member={member} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {details?.cast.length && details.mediaType === 'series' && !(playerTarget && jellyfinPlayerUrl) ? (
            <div className="title-cast-shell">
              <div className="title-cast-panel">
                <div className="title-cast-header">
                  <h3>Cast & Crew</h3>
                </div>
                <div className="title-cast-list">
                  {details.cast.map((member) => (
                    <CastCard key={member.id} member={member} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function buildJellyfinPlayerUrl(baseUrl: string, itemId: string) {
  return `${baseUrl.replace(/\/$/, '')}/web/#/details?id=${encodeURIComponent(itemId)}&autoplay=true`
}

function captureOriginRect(element: HTMLElement): ModalOriginRect {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function CastCard(props: { member: TitleDetailsCastMember }) {
  return (
    <article className="cast-card">
      <div className="cast-card-art">
        {props.member.imageUrl ? <img alt={props.member.name} loading="lazy" src={props.member.imageUrl} /> : <div className="cast-card-fallback">{props.member.name.slice(0, 1).toUpperCase()}</div>}
      </div>
      <div className="cast-card-copy">
        <strong>{props.member.name}</strong>
        {props.member.role ? <span>{props.member.role}</span> : null}
      </div>
    </article>
  )
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" className="title-action-icon" viewBox="0 0 16 16">
      <path d="M5 3.2v9.6L12.6 8 5 3.2Z" fill="currentColor" />
    </svg>
  )
}

function MenuGlyph() {
  return (
    <svg aria-hidden="true" className="title-action-icon" viewBox="0 0 16 16">
      <path d="M3 4.25h10v1.5H3zM3 7.25h10v1.5H3zM3 10.25h10v1.5H3z" fill="currentColor" />
    </svg>
  )
}

function DownloadGlyph() {
  return (
    <svg aria-hidden="true" className="title-action-icon" viewBox="0 0 16 16">
      <path d="M8.75 2.5h-1.5v6.1L5.1 6.45 4 7.55 8 11.55l4-4-1.1-1.1-2.15 2.15V2.5Z" fill="currentColor" />
      <path d="M3 12h10v1.5H3z" fill="currentColor" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg aria-hidden="true" className="title-action-icon" viewBox="0 0 16 16">
      <path d="M5.5 3.25h5l.55 1.25H13v1.25h-1v6.5A1.75 1.75 0 0 1 10.25 14h-4.5A1.75 1.75 0 0 1 4 12.25v-6.5H3V4.5h1.95l.55-1.25Zm-.25 2.5v6.5c0 .28.22.5.5.5h4.5c.28 0 .5-.22.5-.5v-6.5h-5.5ZM6.75 7h1.25v4h-1.25V7Zm2.25 0h1.25v4H9V7Z" fill="currentColor" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M6.45 11.2 3.4 8.15l1.05-1.05 2 2 5.1-5.1 1.05 1.05-6.15 6.15Z" fill="currentColor" />
    </svg>
  )
}

function formatEpisodeMeta(subtitle: string) {
  return subtitle.replace(/^Season\s+\d+\s*,\s*/i, '')
}

function parseContinueEpisodeMeta(card: MediaCard) {
  const match = `${card.subtitle} ${card.hoverLabel || ''}`.match(/\bS(\d{1,2})E(\d{1,3})\b/i)
  if (!match) {
    return null
  }

  return {
    seasonNumber: Number(match[1]),
    episodeNumber: Number(match[2]),
  }
}

function truncateOverview(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text
  }

  const clipped = text.slice(0, maxLength)
  const safeBreak = clipped.lastIndexOf(' ')
  return `${(safeBreak > maxLength * 0.7 ? clipped.slice(0, safeBreak) : clipped).trimEnd()}...`
}

function DownloadsPage(props: {
  downloads: DownloadItem[]
  busyId: string
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2>Downloads</h2>
      </div>
      <section className="downloads-section">
        <div className="downloads-grid">
          {props.downloads.length
            ? props.downloads.map((item) => (
                <DownloadRow
                  busy={props.busyId === item.id}
                  item={item}
                  key={item.id}
                  onDelete={props.onDelete}
                />
              ))
            : <EmptyState copy="The queue will appear here as soon as your services start working." title="No active downloads" />}
        </div>
      </section>
    </div>
  )
}

function DownloadRow(props: {
  item: DownloadItem
  busy: boolean
  onDelete: (id: string) => Promise<void>
}) {
  const item = props.item
  const progressMeta = [item.size, item.speed, item.eta].filter(Boolean).join(' · ')
  const artwork = item.backdropUrl || item.posterUrl
  const isCompleted = item.progress >= 100

  function confirmDelete() {
    if (!window.confirm(`Remove "${item.title}" from the queue?`)) {
      return
    }
    void props.onDelete(item.id)
  }

  return (
    <article className="download-row">
      <div className="download-card">
        <div className="download-artwork">
          {artwork ? <img alt={item.title} loading="lazy" src={artwork} /> : <div className="media-fallback download-poster-fallback">{item.title.slice(0, 1).toUpperCase()}</div>}
        </div>
        <div className="download-copy">
          <h4>{item.title}</h4>
          <p className="download-subtitle">{item.subtitle || item.detail}</p>
          <p className="download-detail">{progressMeta || humanizeDownloadState(item.state)}</p>
        </div>
      </div>

      <div className="download-side">
        <div className="download-progress-panel">
          <div className="download-progress-header">
            <strong>{item.progress}%</strong>
            <span>{progressMeta || humanizeDownloadState(item.state)}</span>
          </div>
          <div className="download-progress-row">
            <div className={isCompleted ? 'download-progress-bar download-progress-complete' : 'download-progress-bar'}>
              <div className="download-progress-fill" style={{ width: `${item.progress}%` }} />
            </div>
            <button
              aria-label={`Delete ${item.title}`}
              className="download-delete-button"
              disabled={props.busy}
              onClick={confirmDelete}
              type="button"
            >
              {props.busy ? '…' : '×'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function humanizeDownloadState(state: string) {
  return state
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function SettingsView(props: {
  config: AppConfig
  connections: ConnectionStatus[]
  jellyfinUsersBusy: boolean
  onLoadJellyfinUsers: () => Promise<void>
  updateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void
  options: ServiceOptionsResponse
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>
  busy: boolean
}) {
  return (
    <form className="settings-page" onSubmit={(event) => void props.onSave(event)}>
      <SettingsCard title="Connections">
        <div className="settings-connections">
          {props.connections.map((connection) => (
            <div className="settings-connection" key={connection.key} title={connection.message}>
              <div className="settings-connection-label">
                <span className={connection.ok ? 'status-dot ok' : 'status-dot down'} />
                <strong>{connection.label}</strong>
              </div>
              <span className="settings-connection-message">{connection.message}</span>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Preferences">
        <label>
          Language
          <input className="input" onChange={(event) => props.updateConfig('preferences', { ...props.config.preferences, language: event.target.value })} value={props.config.preferences.language} />
        </label>
        <label>
          Region
          <input className="input" maxLength={2} onChange={(event) => props.updateConfig('preferences', { ...props.config.preferences, region: event.target.value })} value={props.config.preferences.region} />
        </label>
      </SettingsCard>

      <SettingsCard title="Jellyfin">
        <ServiceFields
          apiKey={props.config.jellyfin.apiKey}
          baseUrl={props.config.jellyfin.baseUrl}
          onApiKeyChange={(apiKey) => props.updateConfig('jellyfin', { ...props.config.jellyfin, apiKey })}
          onBaseUrlChange={(baseUrl) => props.updateConfig('jellyfin', { ...props.config.jellyfin, baseUrl })}
        />
        <div className="inline-actions">
          <button className="secondary-button" disabled={props.jellyfinUsersBusy || !props.config.jellyfin.baseUrl.trim() || !props.config.jellyfin.apiKey.trim()} onClick={() => void props.onLoadJellyfinUsers()} type="button">
            {props.jellyfinUsersBusy ? 'Loading users…' : 'Load users'}
          </button>
        </div>
        <label>
          User
          <select className="input" onChange={(event) => props.updateConfig('jellyfin', { ...props.config.jellyfin, userId: event.target.value })} value={props.config.jellyfin.userId}>
            <option value="">Select user</option>
            {props.options.jellyfinUsers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </SettingsCard>

      <SettingsCard title="Sonarr">
        <ServiceFields
          apiKey={props.config.sonarr.apiKey}
          baseUrl={props.config.sonarr.baseUrl}
          onApiKeyChange={(apiKey) => props.updateConfig('sonarr', { ...props.config.sonarr, apiKey })}
          onBaseUrlChange={(baseUrl) => props.updateConfig('sonarr', { ...props.config.sonarr, baseUrl })}
        />
      </SettingsCard>

      <SettingsCard title="Radarr">
        <ServiceFields
          apiKey={props.config.radarr.apiKey}
          baseUrl={props.config.radarr.baseUrl}
          onApiKeyChange={(apiKey) => props.updateConfig('radarr', { ...props.config.radarr, apiKey })}
          onBaseUrlChange={(baseUrl) => props.updateConfig('radarr', { ...props.config.radarr, baseUrl })}
        />
      </SettingsCard>

      <SettingsCard title="TMDb">
        <label>
          Bearer token
          <input className="input" onChange={(event) => props.updateConfig('tmdb', { bearerToken: event.target.value })} placeholder="Optional if already provided via TMDB_BEARER_TOKEN" value={props.config.tmdb.bearerToken} />
        </label>
      </SettingsCard>

      <div className="actions-row">
        <button className="primary-button" disabled={props.busy} type="submit">
          {props.busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}

function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h2>{title}</h2>
      <div className="settings-fields">{children}</div>
    </section>
  )
}

function ServiceFields(props: {
  baseUrl: string
  apiKey: string
  onBaseUrlChange: (value: string) => void
  onApiKeyChange: (value: string) => void
}) {
  return (
    <>
      <label>
        Base URL
        <input className="input" onChange={(event) => props.onBaseUrlChange(event.target.value)} value={props.baseUrl} />
      </label>
      <label>
        API key
        <input className="input" onChange={(event) => props.onApiKeyChange(event.target.value)} value={props.apiKey} />
      </label>
    </>
  )
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p>{copy}</p>
    </div>
  )
}

function LoadingHub() {
  return (
    <div className="hub-loading">
      <div className="loading-placeholder" />
      <p>Loading media…</p>
    </div>
  )
}

function resolveEntryStage(config: AppConfig, options: ServiceOptionsResponse): EntryStage {
  if (!config.jellyfin.baseUrl.trim() || !config.jellyfin.apiKey.trim()) {
    return 'onboarding'
  }
  if (!options.jellyfinUsers.length) {
    return 'profiles'
  }
  if (!config.jellyfin.userId.trim()) {
    return 'profiles'
  }
  return 'dashboard'
}

export default App
