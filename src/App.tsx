import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useEffect,
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
} from '../shared/contracts'

type AuthState = 'loading' | 'setup' | 'login' | 'app'
type EntryStage = 'onboarding' | 'profiles' | 'dashboard'

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
  const [selectedCard, setSelectedCard] = useState<MediaCard | null>(null)

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
      setHubPages((current) => ({ ...current, [page]: hub }))
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
        setHubPages((current) => ({ ...current, [page]: hub }))
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
      setNotice(authState === 'setup' ? 'Instance initialized.' : 'Signed in.')
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
      setEntryStage(response.jellyfinUsers.length ? 'profiles' : 'onboarding')
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
      setEntryStage('dashboard')
      setNotice('Profile selected.')
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
      <ProfileSelectionScreen
        busy={busy}
        currentUserId={config.jellyfin.userId}
        error={error}
        notice={notice}
        onBackToOnboarding={() => setEntryStage('onboarding')}
        onSelectUser={handleSelectJellyfinUser}
        users={options.jellyfinUsers}
      />
    )
  }

  const currentJellyfinUser =
    options.jellyfinUsers.find((option) => option.id === config.jellyfin.userId)?.label || 'Media cockpit'
  const currentHub = route !== 'downloads' && route !== 'settings' ? hubPages[route as HubPageResponse['page']] : undefined

  return (
    <div className="reiverr-app">
      <Sidebar
        busy={busy}
        connections={connections}
        currentUser={currentJellyfinUser}
        onExitProfile={() => setEntryStage('profiles')}
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

            {route === 'downloads' ? <DownloadsPage downloads={downloads} /> : null}
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
                onOpenCard={setSelectedCard}
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
          card={selectedCard}
          config={config}
          onClose={() => setSelectedCard(null)}
          onRequest={handleRequest}
        />
      ) : null}
    </div>
  )
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
    <aside className="reiverr-sidebar">
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
  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <p className="eyebrow">{mode === 'setup' ? 'First boot' : 'Secure access'}</p>
        <h1>{mode === 'setup' ? 'Create your master password' : 'Sign in to OmniArr'}</h1>
        <p className="auth-copy">
          {mode === 'setup'
            ? 'This password protects the session and encrypts service settings on the server.'
            : 'The full backend remains protected behind the current session.'}
        </p>
        <div className="auth-form">
          <label>
            Password
            <input
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              className="input"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={password}
            />
          </label>
          {!isPasswordValid && password.length > 0 ? <p className="helper-text">Password must be at least 8 non-space characters.</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}
          {busy ? <p className="notice">Contacting backend…</p> : null}
          <button className="primary-button" disabled={busy || !isPasswordValid} onClick={() => void onSubmit()} type="button">
            {busy ? 'Processing…' : mode === 'setup' ? 'Initialize' : 'Sign in'}
          </button>
        </div>
      </section>

      <section className="auth-visual">
        <div className="auth-wallpaper" />
        <div className="glass-card">
          <p className="eyebrow">Migration</p>
          <ul className="feature-list">
            <li>Server-side session auth</li>
            <li>Encrypted persisted settings</li>
            <li>Jellyfin, Sonarr, Radarr and qBittorrent</li>
            <li>Rebuilt React UI with Reiverr layout</li>
          </ul>
        </div>
      </section>
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
  onOpenCard: (card: MediaCard) => void
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

function HeroShowcase({ hero, onOpenCard, tmdbToken }: { hero: MediaCard[]; onOpenCard: (card: MediaCard) => void; tmdbToken: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeLogoUrl, setActiveLogoUrl] = useState('')

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
          setActiveLogoUrl(logo?.file_path ? `https://image.tmdb.org/t/p/original${logo.file_path}` : '')
        }
      })
      .catch(() => {
        if (!cancelled) {
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

function SectionCarousel(props: {
  section: HubPageResponse['sections'][number]
  onRequest: (card: MediaCard) => Promise<void>
  onOpenCard: (card: MediaCard) => void
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
  onOpenCard: (card: MediaCard) => void
  onRequest: (card: MediaCard) => Promise<void>
}) {
  const imageUrl = props.styleType === 'landscape' || props.styleType === 'episode'
    ? (props.card.backdropUrl || props.card.posterUrl)
    : props.card.posterUrl

  return (
    <article className={props.isContinueWatching ? `media-tile ${props.styleType} continue-tile` : `media-tile ${props.styleType}`}>
      <button className="media-art media-trigger" onClick={() => props.onOpenCard(props.card)} type="button">
        {imageUrl ? <img alt={props.card.title} loading="lazy" src={imageUrl} /> : <div className="media-fallback" />}
        {props.card.hoverLabel ? <div className="media-hover-label">{props.card.hoverLabel}</div> : null}
        {props.card.progress ? <div className="tile-progress"><div className="tile-progress-fill" style={{ width: `${props.card.progress}%` }} /></div> : null}
      </button>
    </article>
  )
}

function TitleDetailsModal(props: {
  card: MediaCard
  config: AppConfig
  onClose: () => void
  onRequest: (card: MediaCard) => Promise<void>
}) {
  const canPlay = Boolean(props.card.providerId && props.config.jellyfin.baseUrl)
  const canRequest = Boolean(props.card.tmdbId && props.card.mediaType !== 'mixed')
  const backgroundImage = props.card.backdropUrl || props.card.posterUrl
  const [playerOpen, setPlayerOpen] = useState(false)
  const requestLabel = props.card.mediaType === 'movie' ? 'Add to Radarr' : 'Add to Sonarr'
  const jellyfinPlayerUrl = canPlay
    ? `${props.config.jellyfin.baseUrl.replace(/\/$/, '')}/web/#/details?id=${encodeURIComponent(props.card.providerId!)}&autoplay=true`
    : ''

  return (
    <div className="modal-backdrop" onClick={props.onClose} role="presentation">
      <div className="title-modal reiverr-title-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="title-modal-hero reiverr-title-hero" style={backgroundImage ? { backgroundImage: `url("${backgroundImage}")` } : undefined}>
          <div className="reiverr-title-darken" />
          <button className="modal-close reiverr-modal-close" onClick={props.onClose} type="button">Close</button>
          <div className="reiverr-title-top">
            <div className="reiverr-title-shell">
              <div className="reiverr-title-copy">
                <span className="badge">{props.card.badge || props.card.subtitle || 'Title'}</span>
                <h2>{props.card.title}</h2>
                {props.card.subtitle ? <p className="reiverr-title-subtitle">{props.card.subtitle}</p> : null}
                <div className="title-modal-actions reiverr-title-actions">
                  {canPlay ? <button className="primary-button" onClick={() => setPlayerOpen(true)} type="button">Play</button> : null}
                  {canRequest ? <button className="secondary-button" onClick={() => void props.onRequest(props.card)} type="button">{props.card.actionLabel || requestLabel}</button> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        {playerOpen && jellyfinPlayerUrl ? (
          <div className="reiverr-player-shell">
            <iframe
              allow="autoplay; fullscreen; encrypted-media"
              className="reiverr-player-frame"
              src={jellyfinPlayerUrl}
              title={`${props.card.title} player`}
            />
          </div>
        ) : null}
        <div className="reiverr-title-bottom">
          <div className="reiverr-title-shell reiverr-title-bottom-grid">
            <div className="title-modal-poster reiverr-title-poster">
              {props.card.posterUrl ? <img alt={props.card.title} src={props.card.posterUrl} /> : <div className="media-fallback" />}
            </div>
            <div className="reiverr-title-info">
              <h3>{props.card.title}</h3>
              <p>{props.card.overview || props.card.subtitle || 'No details available yet.'}</p>
              <div className="title-modal-meta">
                {props.card.subtitle ? <span>{props.card.subtitle}</span> : null}
                {props.card.secondaryValue ? <span>{props.card.secondaryValue}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DownloadsPage({ downloads }: { downloads: DownloadItem[] }) {
  return (
    <div className="downloads-page">
      <section className="carousel-section">
        <div className="carousel-title">Downloads</div>
        <div className="downloads-grid">
          {downloads.length ? downloads.map((item) => <DownloadRow item={item} key={item.id} />) : <EmptyState copy="The queue will appear here as soon as your services start working." title="No active downloads" />}
        </div>
      </section>
    </div>
  )
}

function DownloadRow({ item }: { item: DownloadItem }) {
  return (
    <article className="download-row">
      <div>
        <p className="download-source">{item.source}</p>
        <h4>{item.title}</h4>
        <p className="download-detail">{item.detail}</p>
      </div>
      <div className="download-meta">
        <strong>{item.progress}%</strong>
        <p>{[item.size, item.speed, item.eta].filter(Boolean).join(' · ')}</p>
        <div className="tile-progress"><div className="tile-progress-fill" style={{ width: `${item.progress}%` }} /></div>
      </div>
    </article>
  )
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

      <SettingsCard title="qBittorrent">
        <label>
          Base URL
          <input className="input" onChange={(event) => props.updateConfig('qbittorrent', { ...props.config.qbittorrent, baseUrl: event.target.value })} value={props.config.qbittorrent.baseUrl} />
        </label>
        <label>
          Username
          <input className="input" onChange={(event) => props.updateConfig('qbittorrent', { ...props.config.qbittorrent, username: event.target.value })} value={props.config.qbittorrent.username} />
        </label>
        <label>
          Password
          <input className="input" onChange={(event) => props.updateConfig('qbittorrent', { ...props.config.qbittorrent, password: event.target.value })} type="password" value={props.config.qbittorrent.password} />
        </label>
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
