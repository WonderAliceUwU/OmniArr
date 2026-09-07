import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { api } from './api'
import {
  type CalendarEntry,
  defaultConfig,
  type AppConfig,
  type AppRoute,
  type ConnectionStatus,
  type CompletedDownloadItem,
  type DownloadItem,
  type DiskSpaceStatus,
  type HubPageResponse,
  type MediaCard,
  type ProcessingItem,
  type SearchResponse,
  type SelectOption,
  type ServiceOptionsResponse,
  type TitleDetailsCastMember,
  type TitleDetailsEpisode,
  type TitleDetailsResponse,
} from '../shared/contracts'

type AuthState = 'loading' | 'setup' | 'login' | 'profiles' | 'admin' | 'app'
type EntryStage = 'onboarding' | 'profiles' | 'dashboard'
type EntryTransitionState = 'idle' | 'forward-enter' | 'forward-exit' | 'back-enter' | 'back-exit'
const MAX_CACHED_HUB_PAGES = 3
type ModalOriginRect = { left: number; top: number; width: number; height: number }
type SelectedCardState = { card: MediaCard; originRect: ModalOriginRect | null }
const CAROUSEL_SCROLL_DISTANCE_RATIO = 0.84
const EPISODE_SCROLL_DISTANCE_RATIO = 0.72
const SEASON_DOMINANCE_SWITCH_RATIO = 0.12
const SEASON_DOMINANCE_SWITCH_MIN_PX = 56

type SidebarItem = { route: AppRoute; label: string; short: string; icon?: 'calendar' | 'search' | 'downloads' | 'home' | 'library'; iconClassName?: string }

const topSidebarItems: SidebarItem[] = [
  { route: 'search', label: 'Search', short: 'S', icon: 'search', iconClassName: 'sidebar-search-icon' },
  { route: 'calendar', label: 'Upcoming', short: 'C', icon: 'calendar' },
  { route: 'downloads', label: 'Downloads', short: 'D', icon: 'downloads' },
]

const sidebarItems: SidebarItem[] = [
  { route: 'home', label: 'Inicio', short: 'H', icon: 'home' },
  { route: 'dorama', label: 'K-Drama', short: '아' },
  { route: 'anime', label: 'Anime', short: 'あ' },
  { route: 'library', label: 'Library', short: 'L', icon: 'library' },
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
  const [sessionRole, setSessionRole] = useState<'admin' | 'user' | null>(null)
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
  const [processingItems, setProcessingItems] = useState<ProcessingItem[]>([])
  const [completedDownloads, setCompletedDownloads] = useState<CompletedDownloadItem[]>([])
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [diskSpace, setDiskSpace] = useState<DiskSpaceStatus | null>(null)
  const [hubPages, setHubPages] = useState<Partial<Record<HubPageResponse['page'], HubPageResponse>>>({})
  const [hubLoading, setHubLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse['items']>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [lastSearchQuery, setLastSearchQuery] = useState('')
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
    const [settings, serviceOptions, dashboard, storage] = await Promise.all([
      api.getSettings(),
      api.getOptions(),
      api.getDashboard(),
      api.getDiskSpace(),
    ])

    setConfig(settings)
    setOptions(serviceOptions)
    setDownloads(dashboard.downloads)
    setProcessingItems(dashboard.processing || [])
    setCompletedDownloads(dashboard.completedDownloads || [])
    setConnections(dashboard.connections)
    setDiskSpace(storage)
    setEntryStage(resolveEntryStage(settings, serviceOptions))
  }

  async function refreshDownloads() {
    const response = await api.getDownloads()
    setDownloads(response.downloading)
    setProcessingItems(response.processing)
    setCompletedDownloads(response.completed)
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
          const profiles = await api.getProfiles()
          if (cancelled) return
          setOptions((current) => ({ ...current, jellyfinUsers: profiles.jellyfinUsers }))
          setConnections(profiles.connections)
          setAuthState('profiles')
          return
        }

        setSessionRole(session.role ?? null)
        await refreshBaseData()
        if (!cancelled) setAuthState(session.role === 'admin' ? 'admin' : 'app')
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : 'Failed to start OmniArr.')
      setAuthState('profiles')
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

    if (route === 'settings' || route === 'calendar' || route === 'search') {
      return
    }

    if (route === 'downloads') {
      void refreshDownloads()
      const interval = window.setInterval(() => {
        void refreshDownloads()
      }, 2500)
      return () => window.clearInterval(interval)
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
      if (route !== 'downloads' && route !== 'settings' && route !== 'search' && route !== 'calendar') {
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
      setSessionRole('admin')
      if (authState === 'setup') {
        setNotice('Instance initialized.')
      } else {
        setRoute('settings')
      }
      setAuthState(authState === 'setup' ? 'app' : 'admin')
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

  async function handleSelectJellyfinUser(userId: string, jellyfinPassword: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.loginProfile({ userId, password: jellyfinPassword })
      setSessionRole('user')
      await refreshBaseData()
      await transitionEntryStage('dashboard')
      setRoute('home')
      setAuthState('app')
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

  async function handleRequest(card: MediaCard, qualityProfileId?: number, seasonNumber?: number) {
    if (!card.tmdbId) return

    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (card.mediaType === 'movie') {
        await api.requestMovie(card.tmdbId, currentJellyfinUser, qualityProfileId)
      } else {
        await api.requestSeries(card.tmdbId, currentJellyfinUser, qualityProfileId, seasonNumber)
      }
      if (route !== 'downloads' && route !== 'settings' && route !== 'search' && route !== 'calendar') {
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
      await refreshDownloads()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove the download.')
    } finally {
      setDownloadDeleteId('')
    }
  }

  async function handleDismissCompleted(id: string) {
    try {
      await api.dismissCompleted({ id })
      setCompletedDownloads((current) => current.filter((item) => item.id !== id))
    } catch {
      // silent
    }
  }

  async function handleDismissAllCompleted() {
    try {
      await api.dismissAllCompleted()
      setCompletedDownloads([])
    } catch {
      // silent
    }
  }

  async function handleSearchSubmit(query: string) {
    const trimmedQuery = query.trim()
    setSearchQuery(query)
    setError('')

    if (!trimmedQuery) {
      setLastSearchQuery('')
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    try {
      const response = await api.searchTitles(trimmedQuery)
      setSearchResults(response.items)
      setLastSearchQuery(response.query)
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Failed to search the catalog.')
    } finally {
      setSearchLoading(false)
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

  if (authState === 'setup') {
    return (
      <AuthScreen
        busy={busy}
        error={error}
        onSubmit={handleAuthSubmit}
        password={password}
        setPassword={setPassword}
      />
    )
  }

  if (authState === 'login') {
    return (
      <AdministrationLoginScreen
        busy={busy}
        error={error}
        onBack={() => { setPassword(''); setAuthState('profiles') }}
        onSubmit={handleAuthSubmit}
        password={password}
        setPassword={setPassword}
      />
    )
  }

  if (authState === 'profiles') {
    return (
      <ProfileSelectionScreen
        busy={busy}
        currentUserId=""
        hasServiceFailure={connections.some((connection) => !connection.ok)}
        error={error}
        notice={notice}
        onAdmin={() => setAuthState(sessionRole === 'admin' ? 'admin' : 'login')}
        onSelectUser={handleSelectJellyfinUser}
        users={options.jellyfinUsers}
      />
    )
  }

  if (authState === 'admin') {
    return (
      <AdministrationScreen
        busy={busy}
        config={config}
        connections={connections}
        jellyfinUsersBusy={jellyfinUsersBusy}
        onExit={() => setAuthState('profiles')}
        onLoadJellyfinUsers={handleLoadJellyfinUsers}
        onSave={handleSaveSettings}
        options={options}
        updateConfig={updateConfig}
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
          currentUserId={sessionRole === 'user' ? config.jellyfin.userId : ''}
          hasServiceFailure={connections.some((connection) => !connection.ok)}
          error={error}
          notice={notice}
          onAdmin={() => setAuthState(sessionRole === 'admin' ? 'admin' : 'login')}
          onContinue={() => void transitionEntryStage('dashboard')}
          onSelectUser={handleSelectJellyfinUser}
          users={options.jellyfinUsers}
        />
      </div>
    )
  }

  const currentJellyfinUser = sessionRole === 'admin'
    ? 'Administration'
    : options.jellyfinUsers.find((option) => option.id === config.jellyfin.userId)?.label || 'Media cockpit'
  const currentHub = route !== 'downloads' && route !== 'settings' && route !== 'calendar' && route !== 'search' ? hubPages[route as HubPageResponse['page']] : undefined

  return (
    <div className={`reiverr-app ${getEntryTransitionClassName(entryTransitionState)}`}>
      <Sidebar
        busy={busy}
        connections={connections}
        currentUser={currentJellyfinUser}
        diskSpace={diskSpace}
        onExitProfile={() => void transitionEntryStage('profiles')}
        canManage={sessionRole === 'admin'}
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

            {route === 'calendar' ? <CalendarPage onOpenCard={(card, originRect) => setSelectedCard({ card, originRect: originRect ?? null })} /> : null}
            {route === 'downloads' ? <DownloadsPage busyId={downloadDeleteId} completedDownloads={completedDownloads} downloads={downloads} onDelete={handleDeleteDownload} onDismissAllCompleted={handleDismissAllCompleted} onDismissCompleted={handleDismissCompleted} processingItems={processingItems} /> : null}
            {route === 'search' ? (
              <SearchPage
                loading={searchLoading}
                onOpenCard={(card, originRect) => setSelectedCard({ card, originRect: originRect ?? null })}
                onSearch={handleSearchSubmit}
                query={searchQuery}
                results={searchResults}
                submittedQuery={lastSearchQuery}
                updateQuery={setSearchQuery}
              />
            ) : null}
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
            {route !== 'downloads' && route !== 'settings' && route !== 'calendar' && route !== 'search' ? (
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
          qualityProfiles={{
            sonarr: options.sonarrQualityProfiles.filter((profile) => config.preferences.sonarrDownloadQualityProfileIds.includes(profile.id)),
            radarr: options.radarrQualityProfiles.filter((profile) => config.preferences.radarrDownloadQualityProfileIds.includes(profile.id)),
          }}
          onClose={() => setSelectedCard(null)}
          originRect={selectedCard.originRect}
          onRequest={handleRequest}
          currentUser={currentJellyfinUser}
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
  diskSpace: DiskSpaceStatus | null
  connections: ConnectionStatus[]
  busy: boolean
  canManage: boolean
  onExitProfile: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hasServiceFailure = props.connections.some((connection) => !connection.ok)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  function navigate(route: AppRoute) {
    setMenuOpen(false)
    startTransition(() => props.setRoute(route))
  }

  return (
    <>
      <button
        aria-controls="main-navigation"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        className="mobile-menu-toggle"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <aside className={menuOpen ? 'reiverr-sidebar is-open' : 'reiverr-sidebar'} id="main-navigation">
        <div className="sidebar-wallpaper" />
        <div className="sidebar-inner">
          <button aria-label="Close navigation menu" className="mobile-menu-close" onClick={() => setMenuOpen(false)} type="button">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <button
            aria-label="Switch user"
            className="sidebar-profile"
            disabled={props.busy}
            onClick={() => {
              setMenuOpen(false)
              props.onExitProfile()
            }}
            type="button"
          >
            <div className="sidebar-avatar">{props.currentUser.slice(0, 1).toUpperCase()}</div>
            <div className="sidebar-profile-copy">
              <strong>{props.currentUser}</strong>
            </div>
          </button>

        <div className="sidebar-links">
          {topSidebarItems.map((item) => (
            <button
              className={item.route === props.route ? 'sidebar-link active' : 'sidebar-link'}
              key={item.route}
              onClick={() => navigate(item.route)}
              type="button"
            >
              <span className={item.iconClassName ? `sidebar-link-short ${item.iconClassName}` : 'sidebar-link-short'} aria-hidden="true">
                {item.icon === 'calendar' ? <CalendarGlyph /> : item.icon === 'search' ? <SearchGlyph /> : item.icon === 'downloads' ? <DownloadGlyph /> : item.icon === 'home' ? <HomeGlyph /> : item.icon === 'library' ? <LibraryGlyph /> : item.short}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-links">
          {sidebarItems.map((item) => (
            <button
              className={item.route === props.route ? 'sidebar-link active' : 'sidebar-link'}
              key={item.route}
              onClick={() => navigate(item.route)}
              type="button"
            >
              <span className={item.iconClassName ? `sidebar-link-short ${item.iconClassName}` : 'sidebar-link-short'} aria-hidden="true">
                {item.icon === 'calendar' ? <CalendarGlyph /> : item.icon === 'search' ? <SearchGlyph /> : item.icon === 'downloads' ? <DownloadGlyph /> : item.icon === 'home' ? <HomeGlyph /> : item.icon === 'library' ? <LibraryGlyph /> : item.short}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-links">
          {networkSidebarItems.map((item) => (
            <button
              className={item.route === props.route ? 'sidebar-link active' : 'sidebar-link'}
              key={item.route}
              onClick={() => navigate(item.route)}
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
          {props.diskSpace ? <DiskSpaceIndicator diskSpace={props.diskSpace} /> : null}
          {props.canManage ? <button className="ghost-button sidebar-settings" onClick={() => navigate('settings')} type="button">
            <span className="sidebar-settings-icon" aria-hidden="true">
              <SettingsGlyph />
              <span
                className={hasServiceFailure ? 'status-dot down sidebar-settings-status' : 'status-dot ok sidebar-settings-status'}
                title={hasServiceFailure ? 'One or more services are failing.' : 'All services are healthy.'}
              />
            </span>
            <span>Settings</span>
          </button>
          : null}
        </div>
        </div>
      </aside>
    </>
  )
}

function DiskSpaceIndicator({ diskSpace }: { diskSpace: DiskSpaceStatus }) {
  const usedPercentage = diskSpace.totalBytes > 0
    ? Math.max(0, Math.min(100, ((diskSpace.totalBytes - diskSpace.availableBytes) / diskSpace.totalBytes) * 100))
    : 0

  return (
    <div className="sidebar-disk" title={`${formatBytes(diskSpace.availableBytes)} free of ${formatBytes(diskSpace.totalBytes)}${diskSpace.path ? ` (${diskSpace.path})` : ''}`}>
      <span className="sidebar-disk-ring" style={{ '--disk-progress': `${usedPercentage}%` } as CSSProperties}>
        <span className="sidebar-disk-icon" aria-hidden="true">
          <DiskGlyph />
        </span>
      </span>
      <span className="sidebar-disk-copy">
        <strong>Disk space</strong>
        <span>{formatBytes(diskSpace.availableBytes)} free</span>
      </span>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** unitIndex)
  const formattedValue = unitIndex === 0 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
  return `${formattedValue} ${units[unitIndex]}`
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-orb" />
      <p>Preparing OmniArr…</p>
    </div>
  )
}

function SearchGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.25 10.25L13.1 13.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function HomeGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <path d="M2.4 7.1L8 2.6L13.6 7.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M3.4 6.85V13.1H12.6V6.85" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M6.5 13.1V9.6H9.5V13.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function LibraryGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <rect x="2.4" y="4" width="11.2" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 9.9H11.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <circle cx="10.9" cy="7.1" r="0.7" fill="currentColor" />
      <circle cx="8.8" cy="7.1" r="0.7" fill="currentColor" />
    </svg>
  )
}

function SettingsGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <path d="M6.45 2.1H9.55L10 3.7C10.38 3.85 10.74 4.05 11.06 4.29L12.65 3.84L14.2 6.52L13.04 7.7C13.08 7.9 13.1 8.1 13.1 8.3C13.1 8.5 13.08 8.7 13.04 8.9L14.2 10.08L12.65 12.76L11.06 12.31C10.74 12.55 10.38 12.75 10 12.9L9.55 14.5H6.45L6 12.9C5.62 12.75 5.26 12.55 4.94 12.31L3.35 12.76L1.8 10.08L2.96 8.9C2.92 8.7 2.9 8.5 2.9 8.3C2.9 8.1 2.92 7.9 2.96 7.7L1.8 6.52L3.35 3.84L4.94 4.29C5.26 4.05 5.62 3.85 6 3.7L6.45 2.1Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.25" />
      <circle cx="8" cy="8.3" r="2.05" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

function DiskGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <rect x="2.4" y="3" width="11.2" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.8 6H11.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <circle cx="10.9" cy="9.5" r="0.8" fill="currentColor" />
    </svg>
  )
}

function ArrowRightGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <path d="M3 8H13" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M9.25 4.25L13 8L9.25 11.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}

function ActionButton(props: {
  children: ReactNode
  className?: string
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'default' | 'play'
}) {
  const className = [
    'secondary-button',
    'title-action-button',
    props.variant === 'play' ? 'title-action-button-play' : '',
    props.className || '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={className}
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type || 'button'}
    >
      {props.children}
    </button>
  )
}

function AuthScreen({
  password,
  setPassword,
  onSubmit,
  busy,
  error,
}: {
  password: string
  setPassword: (value: string) => void
  onSubmit: () => Promise<void>
  busy: boolean
  error: string
}) {
  const isPasswordValid = password.trim().length >= 8

  function handleSubmit() {
    if (busy || !isPasswordValid) {
      return
    }

    void onSubmit()
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <div className="auth-panel-shell">
          <h1>Create your master password</h1>
          <p className="auth-copy">This password protects the administration area and service settings.</p>
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
              Master password
              <input
                autoComplete="new-password"
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
            <button className="primary-button" disabled={busy || !isPasswordValid} type="submit">
              {busy ? 'Processing…' : 'Initialize'}
            </button>
          </form>
        </div>
      </section>

      <section className="auth-visual">
        <div className="auth-wallpaper" />
        <div className="glass-card">
          <p className="eyebrow">Migration</p>
          <ul className="feature-list">
            <li>Server-side session auth</li>
            <li>Encrypted persisted settings</li>
            <li>Jellyfin, Sonarr and Radarr</li>
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
                <ProfileAvatar user={user} />
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
  hasServiceFailure: boolean
  busy: boolean
  error: string
  notice: string
  onSelectUser: (userId: string, password: string) => Promise<void>
  onAdmin: () => void
  onContinue?: () => void
}) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [password, setPassword] = useState('')
  const [isReturning, setIsReturning] = useState(false)
  const [hasReturned, setHasReturned] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [isEntering, setIsEntering] = useState(false)

  function submit() {
    if (selectedUserId && password) {
      void props.onSelectUser(selectedUserId, password)
    }
  }

  function goBack() {
    setIsReturning(true)
    window.setTimeout(() => {
      setSelectedUserId('')
      setPassword('')
      setIsReturning(false)
      setHasReturned(true)
      window.setTimeout(() => setHasReturned(false), 520)
    }, 240)
  }

  function selectProfile(userId: string) {
    setIsSelecting(true)
    window.setTimeout(() => {
      setSelectedUserId(userId)
      setIsSelecting(false)
      setIsEntering(true)
      window.setTimeout(() => setIsEntering(false), 520)
    }, 240)
  }

  const selectedUser = props.users.find((user) => user.id === selectedUserId)

  return (
    <div className={selectedUser ? `profiles-layout is-profile-login${isReturning ? ' is-returning' : ''}${isEntering ? ' is-entering' : ''}` : `profiles-layout${hasReturned ? ' is-profile-return' : ''}${isSelecting ? ' is-profile-selecting' : ''}`}>
      <div className="profiles-header">
        <h1>{selectedUser ? `Sign in as ${selectedUser.label}` : 'Who\'s watching?'}</h1>
        {props.error ? <p className="error-banner">{props.error}</p> : null}
        {props.notice ? <p className="notice">{props.notice}</p> : null}
      </div>
      {selectedUser ? <ProfileLoginForm busy={props.busy} icon={<ProfileAvatar user={selectedUser} />} onBack={goBack} onSubmit={submit} password={password} placeholder="Enter the password" setPassword={setPassword} /> : <div className="profile-grid">
        {props.users.map((user) => (
          <button
            className={user.id === props.currentUserId ? 'profile-card active' : 'profile-card'}
            disabled={props.busy || isSelecting}
            key={user.id}
            onClick={() => {
              if (user.id === props.currentUserId) {
                props.onContinue?.()
              } else {
                selectProfile(user.id)
              }
            }}
            type="button"
          >
            <ProfileAvatar user={user} />
            <strong>{user.label}</strong>
            {user.id === props.currentUserId ? <span className="profile-active-check" aria-label="Current profile">✓</span> : null}
          </button>
        ))}
      </div>}
      {!selectedUser ? <div className="profiles-actions">
        <button aria-label="Administration" className="profile-admin-button" onClick={props.onAdmin} title="Administration" type="button">
          <span className="profile-admin-icon">
            <SettingsGlyph />
            <span className={props.hasServiceFailure ? 'profile-admin-status down' : 'profile-admin-status ok'} />
          </span>
        </button>
      </div> : null}
    </div>
  )
}

function ProfileAvatar({ user }: { user: SelectOption }) {
  return <div className="profile-avatar">{user.imageUrl ? <img alt="" src={user.imageUrl} /> : user.label.slice(0, 1).toUpperCase()}</div>
}

function AdministrationLoginScreen(props: {
  busy: boolean
  error: string
  password: string
  setPassword: (value: string) => void
  onBack: () => void
  onSubmit: () => Promise<void>
}) {
  const [isReturning, setIsReturning] = useState(false)

  function goBack() {
    setIsReturning(true)
    window.setTimeout(props.onBack, 240)
  }

  return (
    <div className={`profiles-layout is-profile-login is-entering${isReturning ? ' is-returning' : ''}`}>
      <div className="profiles-header">
        <h1>Administration</h1>
        {props.error ? <p className="error-banner">{props.error}</p> : null}
      </div>
      <ProfileLoginForm busy={props.busy} icon={<div className="administration-login-icon"><SettingsGlyph /></div>} onBack={goBack} onSubmit={() => { void props.onSubmit() }} password={props.password} placeholder="Enter the master password" setPassword={props.setPassword} />
    </div>
  )
}

function ProfileLoginForm(props: {
  busy: boolean
  icon: ReactNode
  password: string
  placeholder: string
  setPassword: (value: string) => void
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <form className="profile-login-form" onSubmit={(event) => { event.preventDefault(); props.onSubmit() }}>
      {props.icon}
      <label>
        <input autoComplete="current-password" autoFocus className="input" onChange={(event) => props.setPassword(event.target.value)} placeholder={props.placeholder} type="password" value={props.password} />
      </label>
      <div className="profile-login-actions">
        <button aria-label="Back to profiles" className="profile-login-back" onClick={props.onBack} title="Back to profiles" type="button"><ArrowLeftGlyph /></button>
        <button aria-label="Sign in" className="profile-login-submit" disabled={props.busy || !props.password} title="Sign in" type="submit"><SignInGlyph /></button>
      </div>
    </form>
  )
}

function SignInGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <path d="M9.7 2.5H4.3A1.3 1.3 0 0 0 3 3.8v8.4a1.3 1.3 0 0 0 1.3 1.3h5.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="M8 8h5M10.85 5.15 13.7 8l-2.85 2.85" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
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
        section.id === 'library-movies' || section.id === 'library-series'
          ? <LibraryGrid busy={props.busy} key={section.id} onOpenCard={props.onOpenCard} onRequest={props.onRequest} section={section} />
          : <SectionCarousel busy={props.busy} key={section.id} onOpenCard={props.onOpenCard} onRequest={props.onRequest} section={section} />
      ))}
    </div>
  )
}

function LibraryGrid(props: {
  section: HubPageResponse['sections'][number]
  onRequest: (card: MediaCard) => Promise<void>
  onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void
  busy: boolean
}) {
  if (!props.section.items.length) return null

  return (
    <section className="library-grid-section">
      <div className="carousel-title">{props.section.title}</div>
      <div className="carousel-section library-grid">
        {props.section.items.map((card) => (
          <MediaTile busy={props.busy} card={card} isContinueWatching={false} key={card.id} onOpenCard={props.onOpenCard} onRequest={props.onRequest} styleType="landscape" />
        ))}
      </div>
    </section>
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
      setActiveLogoUrl(featured?.logoUrl || '')
      return
    }

    if (featured.logoUrl) {
      setActiveLogoUrl(featured.logoUrl)
      return
    }

    const mediaType = featured.mediaType === 'movie'
      ? 'movie'
      : featured.mediaType === 'tv' || featured.mediaType === 'series' || featured.mediaType === 'episode'
        ? 'tv'
        : ''
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
  }, [featured, tmdbToken])

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
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false })

  useEffect(() => {
    const track = trackRef.current
    if (!track) {
      setScrollState({ canScrollLeft: false, canScrollRight: false })
      return
    }

    const syncScrollState = () => {
      const maxScrollLeft = track.scrollWidth - track.clientWidth
      setScrollState({
        canScrollLeft: track.scrollLeft > 8,
        canScrollRight: maxScrollLeft - track.scrollLeft > 8,
      })
    }

    syncScrollState()
    track.addEventListener('scroll', syncScrollState, { passive: true })
    window.addEventListener('resize', syncScrollState)

    return () => {
      track.removeEventListener('scroll', syncScrollState)
      window.removeEventListener('resize', syncScrollState)
    }
  }, [props.section.items.length])

  if (!props.section.items.length) return null

  function scrollTrack(direction: 'left' | 'right') {
    const track = trackRef.current
    if (!track) return

    const distance = Math.max(track.clientWidth * CAROUSEL_SCROLL_DISTANCE_RATIO, 320)
    track.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    })
  }

  return (
    <section className={props.section.id === 'continue' ? 'carousel-row continue-row' : 'carousel-row'}>
      <div className="carousel-title">{props.section.title}</div>
      <div
        className={[
          'carousel-section',
          scrollState.canScrollLeft ? 'show-left-fade has-left-nav' : '',
          scrollState.canScrollRight ? 'show-right-fade' : '',
        ].filter(Boolean).join(' ')}
      >
        {scrollState.canScrollLeft ? (
          <button
            aria-label={`Scroll ${props.section.title} left`}
            className="carousel-nav left"
            onClick={() => scrollTrack('left')}
            type="button"
          />
        ) : null}
        <div className="carousel-track" ref={trackRef}>
          {props.section.items.map((card) => (
            <MediaTile busy={props.busy} card={card} isContinueWatching={props.section.id === 'continue'} key={card.id} onOpenCard={props.onOpenCard} onRequest={props.onRequest} styleType={props.section.style || 'landscape'} />
          ))}
        </div>
        <button
          aria-label={`Scroll ${props.section.title} right`}
          className="carousel-nav right"
          disabled={!scrollState.canScrollRight}
          onClick={() => scrollTrack('right')}
          type="button"
        />
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
  const showLandscapeLogo = (props.styleType === 'landscape' || props.styleType === 'episode') && props.card.logoUrl && props.card.backdropLanguageFallback
  const tileClassName = [
    'media-tile',
    props.styleType,
    showLandscapeLogo ? 'has-landscape-logo' : '',
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
        {imageUrl ? (
          <picture>
            {props.styleType === 'landscape' || props.styleType === 'episode' ? <source media="(max-width: 980px)" srcSet={props.card.posterUrl || imageUrl} /> : null}
            <img alt={props.card.title} loading="lazy" src={imageUrl} />
          </picture>
        ) : <div className="media-fallback" />}
        {showLandscapeLogo ? (
          <div className="media-landscape-logo-wrap">
            <img alt="" className="media-landscape-logo" loading="lazy" src={props.card.logoUrl} />
          </div>
        ) : null}
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
  onRequest: (card: MediaCard, qualityProfileId?: number, seasonNumber?: number) => Promise<void>
  currentUser: string | null
  qualityProfiles: { sonarr: SelectOption[]; radarr: SelectOption[] }
}) {
  const [details, setDetails] = useState<TitleDetailsResponse | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsError, setDetailsError] = useState('')
  const [activeSeasonId, setActiveSeasonId] = useState<string | undefined>(undefined)
  const [episodeWatchBusyId, setEpisodeWatchBusyId] = useState<string | null>(null)
  const [episodeDownloadBusyId, setEpisodeDownloadBusyId] = useState<string | null>(null)
  const [pendingEpisodeRequestIds, setPendingEpisodeRequestIds] = useState<string[]>([])
  const [pendingSeasonRequestIds, setPendingSeasonRequestIds] = useState<string[]>([])
  const [seasonActionBusy, setSeasonActionBusy] = useState<'download' | 'delete' | null>(null)
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false)
  const [movieRequestPending, setMovieRequestPending] = useState(false)
  const [movieDeleteBusy, setMovieDeleteBusy] = useState(false)
  const [qualityPicker, setQualityPicker] = useState<{
    title: string
    logoUrl?: string
    profiles: SelectOption[]
    onConfirm: (qualityProfileId?: number) => void
  } | null>(null)
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
  const seasonMenuRef = useRef<HTMLDivElement | null>(null)
  const seasonMenuOptionsRef = useRef<HTMLDivElement | null>(null)
  const pendingSeasonScrollRef = useRef<string | null>(null)
  const initialEpisodeFocusKeyRef = useRef('')
  const hasUserScrolledEpisodeListRef = useRef(false)
  const initialEpisodeListScrollLeftRef = useRef(0)
  const seasonValue = activeSeasonId ?? details?.selectedSeasonId ?? ''

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
    setEpisodeDownloadBusyId(null)
    setPendingEpisodeRequestIds([])
    setPendingSeasonRequestIds([])
    setSeasonActionBusy(null)
    setSeasonMenuOpen(false)
    setMovieRequestPending(false)
    setPlayerTarget(null)
    setIsOverviewExpanded(false)
    pendingSeasonScrollRef.current = null
    initialEpisodeFocusKeyRef.current = ''
    hasUserScrolledEpisodeListRef.current = false
    initialEpisodeListScrollLeftRef.current = 0
  }, [props.card.id])

  useEffect(() => {
    if (!seasonMenuOpen) {
      return
    }

    function closeSeasonMenuOnOutsidePress(event: PointerEvent) {
      if (!seasonMenuRef.current?.contains(event.target as Node)) {
        setSeasonMenuOpen(false)
      }
    }

    function closeSeasonMenuOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSeasonMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', closeSeasonMenuOnOutsidePress)
    window.addEventListener('keydown', closeSeasonMenuOnEscape)

    return () => {
      window.removeEventListener('pointerdown', closeSeasonMenuOnOutsidePress)
      window.removeEventListener('keydown', closeSeasonMenuOnEscape)
    }
  }, [seasonMenuOpen])

  useEffect(() => {
    if (!seasonMenuOpen || !seasonMenuOptionsRef.current) {
      return
    }

    const selectedOption = seasonMenuOptionsRef.current.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!selectedOption) {
      return
    }

    seasonMenuOptionsRef.current.scrollTop = Math.max(
      0,
      selectedOption.offsetTop - (seasonMenuOptionsRef.current.clientHeight - selectedOption.offsetHeight) / 2
    )
  }, [seasonMenuOpen, seasonValue])

  function updateEpisodeInCaches(episodeId: string, updater: (episode: NonNullable<TitleDetailsResponse['episodes']>[number]) => NonNullable<TitleDetailsResponse['episodes']>[number]) {
    setDetails((current) => current && current.episodes.some((episode) => episode.id === episodeId)
      ? {
          ...current,
          episodes: current.episodes.map((episode) => episode.id === episodeId ? updater(episode) : episode)
        }
      : current)
  }

  const refreshSeasonState = useCallback(async (targetSeasonId?: string) => {
    const refreshSeasonId = targetSeasonId || activeSeasonId || details?.selectedSeasonId
    const nextDetails = await api.getTitleDetails(props.card, refreshSeasonId)
    setDetails(nextDetails)
    setDetailsError('')
    setActiveSeasonId(refreshSeasonId || nextDetails.selectedSeasonId)
  }, [activeSeasonId, details?.selectedSeasonId, props.card])

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
  const truncatedOverview = truncateOverview(displayOverview, window.matchMedia('(max-width: 980px)').matches ? 150 : 260)
  const shouldShowOverviewToggle = truncatedOverview !== displayOverview
  const jellyfinPlayerUrl = playerTarget && props.config.jellyfin.baseUrl
    ? buildJellyfinPlayerUrl(props.config.jellyfin.baseUrl, playerTarget.id)
    : ''
  const playLabel = playerTarget?.title || details?.episodes.find((episode) => episode.id === playId)?.title || displayTitle
  const activeSeasonMeta = details?.seasons.find((season) => season.id === seasonValue)
  const effectiveActiveSeasonMeta = activeSeasonMeta && pendingSeasonRequestIds.includes(activeSeasonMeta.id)
    && activeSeasonMeta.downloadStatus === 'idle'
      ? {
          ...activeSeasonMeta,
          downloadStatus: 'processing' as const,
        }
      : activeSeasonMeta
  const activeSeasonDetails = details && seasonValue
    ? { episodes: getSeasonEpisodes(details.episodes, seasonValue) }
    : null
  const movieRequestStatus = movieRequestPending && (details?.requestStatus || 'idle') === 'idle'
    ? 'processing'
    : details?.requestStatus || 'idle'
  const movieRequestProgress = details?.requestProgress || 0
  const isMovieRequestActive = details?.mediaType === 'movie' && (movieRequestStatus === 'processing' || movieRequestStatus === 'downloading')
  const canDeleteMovieAction = Boolean(details?.mediaType === 'movie' && details.radarrMovieId)
  const activeSeasonNumber = effectiveActiveSeasonMeta?.seasonNumber
  const activeSeasonDownloadStatus = effectiveActiveSeasonMeta?.downloadStatus || 'idle'
  const currentSeasonIndex = details?.seasons.findIndex((season) => season.id === seasonValue) ?? -1
  const resolvedSeasonIndex = currentSeasonIndex >= 0 ? currentSeasonIndex : 0
  const hasPreviousSeason = Boolean(details?.seasons.length && resolvedSeasonIndex > 0)
  const hasNextSeason = Boolean(details?.seasons.length && resolvedSeasonIndex < details.seasons.length - 1)
  const visibleEpisodes = details
    ? details.episodes.map((episode) => pendingEpisodeRequestIds.includes(episode.id)
      && episode.downloadStatus !== 'downloading'
      && episode.availability !== 'available'
        ? {
            ...episode,
            downloadStatus: 'processing' as const,
            canDownload: false,
          }
        : episode)
    : []
  const canDownloadSeasonAction = Boolean(
    activeSeasonDownloadStatus === 'processing'
    || activeSeasonDownloadStatus === 'downloading'
    || (details?.sonarrSeriesId && typeof activeSeasonNumber === 'number' && activeSeasonNumber > 0)
    || effectiveActiveSeasonMeta?.canDownload
    || (canRequest && !details?.sonarrSeriesId && typeof activeSeasonNumber === 'number')
  )
  const episodesForSeason = visibleEpisodes.filter(episode => episode.seasonId === seasonValue);
  const isSeasonFullyDownloadedExceptUnaired = episodesForSeason.length > 0 && episodesForSeason.every(
    (episode) => episode.availability === 'available' || episode.availability === 'unaired'
  );
  const canDeleteSeasonAction = (Boolean(effectiveActiveSeasonMeta?.canDelete) || isSeasonFullyDownloadedExceptUnaired);
  const shouldShowDownloadSeasonAction = canDownloadSeasonAction && !canDeleteSeasonAction;

  useEffect(() => {
    if (!details || details.mediaType !== 'series') {
      return
    }

    setPendingEpisodeRequestIds((current) => current.filter((episodeId) => {
      const episode = details.episodes.find((entry) => entry.id === episodeId)
      if (!episode) {
        return false
      }

      return episode.downloadStatus !== 'downloading' && episode.availability !== 'available'
    }))
  }, [details])

  useEffect(() => {
    if (!pendingEpisodeRequestIds.length) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPendingEpisodeRequestIds([])
    }, 20000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pendingEpisodeRequestIds])

  useEffect(() => {
    if (!details || details.mediaType !== 'series') {
      return
    }

    setPendingSeasonRequestIds((current) => current.filter((seasonId) => {
      const season = details.seasons.find((entry) => entry.id === seasonId)
      if (!season) {
        return false
      }

      return season.downloadStatus !== 'downloading' && season.canDelete !== true
    }))
  }, [details])

  useEffect(() => {
    if (!pendingSeasonRequestIds.length) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPendingSeasonRequestIds([])
    }, 25000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pendingSeasonRequestIds])

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
  }, [activeSeasonDownloadStatus, details, refreshSeasonState, seasonValue])

  useEffect(() => {
    if (!details || details.mediaType !== 'series') {
      return
    }

    const hasEpisodeTransfers = details.episodes.some((episode) =>
      episode.downloadStatus === 'processing' || episode.downloadStatus === 'downloading'
    )

    if (!hasEpisodeTransfers) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshSeasonState(seasonValue || undefined)
    }, 2500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [details, refreshSeasonState, seasonValue])

  useEffect(() => {
    if (!details || details.mediaType !== 'movie') {
      return
    }

    if (movieRequestPending && details.requestStatus === 'downloading') {
      setMovieRequestPending(false)
    }
  }, [details, movieRequestPending])

  useEffect(() => {
    if (!movieRequestPending) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMovieRequestPending(false)
    }, 5 * 60 * 1000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [movieRequestPending])

  useEffect(() => {
    if (!details || details.mediaType !== 'movie') {
      return
    }

    if (movieRequestStatus !== 'processing' && movieRequestStatus !== 'downloading') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void refreshSeasonState()
    }, movieRequestStatus === 'processing' ? 2000 : 2500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [details, movieRequestStatus, refreshSeasonState])

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
    setSeasonMenuOpen(false)
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

  function openQualityPicker(
    title: string,
    profiles: SelectOption[],
    onConfirm: (qualityProfileId?: number) => void
  ) {
    setQualityPicker({ title, logoUrl, profiles, onConfirm })
  }

  async function handleSeasonDownload(qualityProfileId?: number) {
    if (typeof activeSeasonNumber !== 'number') {
      return
    }

    if (activeSeasonDownloadStatus === 'processing' || activeSeasonDownloadStatus === 'downloading') {
      return
    }

    setSeasonActionBusy('download')
    setDetailsError('')
    try {
      if (activeSeasonMeta?.id) {
        setPendingSeasonRequestIds((current) => current.includes(activeSeasonMeta.id) ? current : [...current, activeSeasonMeta.id])
      }
      if (details?.sonarrSeriesId) {
        await api.requestSeason({
          seriesId: details.sonarrSeriesId,
          seasonNumber: activeSeasonNumber,
          qualityProfileId,
        }, props.currentUser)
      } else {
        await props.onRequest(props.card, qualityProfileId, activeSeasonNumber)
      }
      await refreshSeasonState(seasonValue || undefined)
    } catch (error) {
      if (activeSeasonMeta?.id) {
        setPendingSeasonRequestIds((current) => current.filter((id) => id !== activeSeasonMeta.id))
      }
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
      setDetails((current) => current
        ? {
            ...current,
            episodes: current.episodes.map((episode) => {
              if (episode.seasonId !== seasonValue || episode.availability === 'unaired') {
                return episode
              }

              return {
                ...episode,
                availableInJellyfin: false,
                availability: 'missing',
                downloadStatus: 'idle',
                downloadProgress: undefined,
                canDownload: true,
                canDelete: false,
              }
            }),
            seasons: current.seasons.map((season) => season.id === seasonValue
              ? {
                  ...season,
                  availableEpisodeCount: 0,
                  missingEpisodeCount: current.episodes.filter(
                    (episode) => episode.seasonId === seasonValue && episode.availability !== 'unaired'
                  ).length,
                  canDownload: true,
                  canDelete: false,
                  isDownloading: false,
                  downloadStatus: 'idle',
                  downloadProgress: undefined,
                  downloadLabel: undefined,
                }
              : season),
          }
        : current)

      window.setTimeout(() => {
        void refreshSeasonState(seasonValue || undefined)
      }, 2000)
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Failed to delete season files.')
    } finally {
      setSeasonActionBusy(null)
    }
  }

  async function handleMovieRequest(qualityProfileId?: number) {
    if (details?.mediaType !== 'movie' || movieRequestStatus === 'processing' || movieRequestStatus === 'downloading') {
      return
    }

    setDetailsError('')
    setMovieRequestPending(true)
    setDetails((current) => current && current.mediaType === 'movie'
      ? {
          ...current,
          requestStatus: 'processing',
          requestProgress: undefined,
        }
      : current)

    try {
      await props.onRequest(props.card, qualityProfileId)
      await refreshSeasonState()
    } catch (error) {
      setMovieRequestPending(false)
      setDetails((current) => current && current.mediaType === 'movie'
        ? {
            ...current,
            requestStatus: 'idle',
            requestProgress: undefined,
          }
        : current)
      setDetailsError(error instanceof Error ? error.message : 'Failed to queue the movie download.')
    }
  }

  async function handleMovieDelete() {
    if (!details?.radarrMovieId) {
      return
    }

    if (!window.confirm(`Delete ${displayTitle} from Radarr and remove its downloaded files?`)) {
      return
    }

    setMovieDeleteBusy(true)
    setDetailsError('')
    try {
      await api.deleteMovie({ movieId: details.radarrMovieId })
      setDetails((current) => current && current.mediaType === 'movie'
        ? {
            ...current,
            availableInJellyfin: false,
            providerId: undefined,
            playTargetId: undefined,
            radarrMovieId: undefined,
            requestStatus: 'idle',
            requestProgress: undefined,
          }
        : current)
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Failed to delete movie files.')
    } finally {
      setMovieDeleteBusy(false)
    }
  }

  function handleEpisodeDownload(
    event: MouseEvent<HTMLButtonElement>,
    episodeId: string,
    sonarrEpisodeId: number | undefined,
    availability: TitleDetailsResponse['episodes'][number]['availability']
  ) {
    event.preventDefault()
    event.stopPropagation()

    if (!sonarrEpisodeId || availability === 'downloading' || episodeDownloadBusyId === episodeId) {
      return
    }

    openQualityPicker(
      `Download ${details?.episodes.find((episode) => episode.id === episodeId)?.title || 'episode'}`,
      props.qualityProfiles.sonarr,
      (qualityProfileId) => queueEpisodeDownload(episodeId, sonarrEpisodeId, availability, qualityProfileId)
    )
  }

  function queueEpisodeDownload(
    episodeId: string,
    sonarrEpisodeId: number,
    availability: TitleDetailsResponse['episodes'][number]['availability'],
    qualityProfileId?: number
  ) {
    setEpisodeDownloadBusyId(episodeId)
    setPendingEpisodeRequestIds((current) => current.includes(episodeId) ? current : [...current, episodeId])
    updateEpisodeInCaches(episodeId, (episode) => ({
      ...episode,
      downloadStatus: 'processing',
      downloadProgress: undefined,
      canDownload: false,
    }))

    void api.requestEpisode({ episodeId: sonarrEpisodeId, qualityProfileId }, props.currentUser)
      .catch(() => {
        setPendingEpisodeRequestIds((current) => current.filter((id) => id !== episodeId))
        updateEpisodeInCaches(episodeId, (episode) => ({
          ...episode,
          availability,
          downloadStatus: 'idle',
          downloadProgress: undefined,
          canDownload: availability === 'missing',
        }))
      })
      .finally(() => {
        setEpisodeDownloadBusyId((current) => current === episodeId ? null : current)
      })
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
              <button aria-label="Close" className="modal-close reiverr-modal-close" onClick={handleRequestClose} type="button">×</button>
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
                  <div className="title-mobile-summary-actions">
                    {canPlay ? (
                      <ActionButton className="title-mobile-summary-play" onClick={() => setPlayerTarget({ id: playId!, title: playLabel })} variant="play">
                        <PlayGlyph />
                        <span>Play</span>
                      </ActionButton>
                    ) : null}
                    {canDeleteMovieAction ? (
                      <ActionButton
                        aria-label="Delete movie files"
                        className="title-mobile-summary-delete title-action-button-delete"
                        disabled={movieDeleteBusy}
                        onClick={() => void handleMovieDelete()}
                      >
                        <TrashGlyph />
                      </ActionButton>
                    ) : null}
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
                      {canPlay && details?.mediaType !== 'series' ? (
                        <ActionButton className="title-summary-header-play" onClick={() => setPlayerTarget({ id: playId!, title: playLabel })} variant="play">
                          <PlayGlyph />
                          <span>Play</span>
                        </ActionButton>
                      ) : null}
                      {canDeleteMovieAction ? (
                        <ActionButton
                          aria-label="Delete movie files"
                          className="title-summary-header-delete title-action-button-delete"
                          disabled={movieDeleteBusy}
                          onClick={() => void handleMovieDelete()}
                        >
                          <TrashGlyph />
                        </ActionButton>
                      ) : null}
                      {!canPlay && canRequest && details?.mediaType !== 'series' ? (
                        isMovieRequestActive ? (
                          movieRequestStatus === 'downloading' ? (
                            <div
                              aria-label="Movie downloading"
                              className="title-movie-request-progress"
                              role="img"
                              title={`${movieRequestProgress}% downloaded`}
                            >
                              <span
                                className="title-movie-request-progress-ring"
                                style={{ '--movie-download-progress': `${movieRequestProgress}` } as React.CSSProperties}
                              />
                              <span className="title-movie-request-progress-percent">{`${movieRequestProgress}%`}</span>
                            </div>
                          ) : (
                            <div
                              aria-label="Movie processing"
                              className="title-movie-request-processing"
                              role="img"
                              title="Processing"
                            >
                              <span className="title-movie-request-spinner" aria-hidden="true" />
                            </div>
                          )
                        ) : (
                          <button
                            className="secondary-button title-action-button"
                            onClick={() => openQualityPicker(displayTitle, props.qualityProfiles.radarr, (qualityProfileId) => void handleMovieRequest(qualityProfileId))}
                            type="button"
                          >
                            <DownloadGlyph />
                            <span>Request</span>
                          </button>
                        )
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
                        <button
                          aria-label="Previous season"
                          className="title-season-nav"
                          disabled={!hasPreviousSeason}
                          onClick={() => changeSeason(-1)}
                          type="button"
                        />
                        {details.seasons.length ? (
                          <div className="title-season-selector" ref={seasonMenuRef}>
                            <span className="title-season-kicker">Season</span>
                            <select
                              aria-label="Season"
                              className="mobile-season-select"
                              onChange={(event) => handleSeasonSelectChange(event.target.value)}
                              value={seasonValue}
                            >
                              {details.seasons.map((season) => (
                                <option key={season.id} value={season.id}>{season.title}</option>
                              ))}
                            </select>
                            <button
                              aria-controls="title-season-options"
                              aria-expanded={seasonMenuOpen}
                              aria-haspopup="listbox"
                              className="title-season-select"
                              onClick={() => setSeasonMenuOpen((open) => !open)}
                              type="button"
                            >
                              <span>{details.seasons.find((season) => season.id === seasonValue)?.title || 'Select season'}</span>
                              <span aria-hidden="true" className="title-season-select-chevron" />
                            </button>
                            {seasonMenuOpen ? (
                              <div aria-label="Seasons" className="title-season-options" id="title-season-options" ref={seasonMenuOptionsRef} role="listbox">
                                {details.seasons.map((season) => (
                                  <button
                                    aria-selected={season.id === seasonValue}
                                    className={season.id === seasonValue ? 'is-selected' : ''}
                                    key={season.id}
                                    onClick={() => handleSeasonSelectChange(season.id)}
                                    role="option"
                                    type="button"
                                  >
                                    {season.title}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
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
                                    <span
                                      className="title-season-progress-ring"
                                      style={{ '--season-download-progress': `${activeSeasonMeta?.downloadProgress || 0}` } as React.CSSProperties}
                                    />
                                    <span className="title-season-progress-percent">{`${activeSeasonMeta?.downloadProgress || 0}%`}</span>
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
                                      onClick={() => openQualityPicker(
                                        `${displayTitle} · ${activeSeasonMeta?.title || 'Season'}`,
                                        props.qualityProfiles.sonarr,
                                        (qualityProfileId) => void handleSeasonDownload(qualityProfileId)
                                      )}
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
                                {hasNextSeason ? (
                                  <>
                                    <button
                                      aria-label="Next season"
                                      className="title-season-nav next"
                                      onClick={() => changeSeason(1)}
                                      type="button"
                                    />
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                        <div className="title-season-strip-spacer" />
                        {canPlay ? (
                          <ActionButton
                            className="title-season-play-button"
                            onClick={() => setPlayerTarget({ id: playId!, title: playLabel })}
                            variant="play"
                          >
                            <PlayGlyph />
                            <span>Play</span>
                          </ActionButton>
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
                                {episode.canDownload || episode.downloadStatus === 'processing' || episode.downloadStatus === 'downloading' ? (
                                  episode.downloadStatus === 'downloading' ? (
                                    <span
                                      aria-label="Episode downloading"
                                      className="episode-card-availability-progress"
                                      title={`${episode.downloadProgress || 0}% downloaded`}
                                    >
                                      <span
                                        className="episode-card-availability-ring"
                                        style={{ '--episode-download-progress': `${episode.downloadProgress || 0}` } as React.CSSProperties}
                                      />
                                      <span className="episode-card-availability-percent">{`${episode.downloadProgress || 0}%`}</span>
                                    </span>
                                  ) : episode.downloadStatus === 'processing' ? (
                                    <span
                                      aria-label="Episode processing"
                                      className="episode-card-availability-processing"
                                      title="Processing"
                                    >
                                      <span className="episode-card-processing-spinner" aria-hidden="true" />
                                    </span>
                                  ) : (
                                    <button
                                      aria-label="Download episode"
                                      className="episode-card-availability episode-card-availability-button"
                                      disabled={episodeDownloadBusyId === episode.id}
                                      onClick={(event) => handleEpisodeDownload(
                                        event,
                                        episode.id,
                                        episode.sonarrEpisodeId,
                                        episode.availability
                                      )}
                                      title="Available to download"
                                      type="button"
                                    >
                                      <DownloadGlyph />
                                    </button>
                                  )
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
                              <span>
                                {episode.availability === 'unaired' && episode.airDate
                                  ? `${formatEpisodeMeta(episode.subtitle)} - Airs ${new Date(episode.airDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                                  : formatEpisodeMeta(episode.subtitle)}
                              </span>
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
          {qualityPicker ? (
            <QualityPicker
              onCancel={() => setQualityPicker(null)}
              onSelect={(qualityProfileId) => {
                const request = qualityPicker
                setQualityPicker(null)
                request.onConfirm(qualityProfileId)
              }}
              profiles={qualityPicker.profiles}
              logoUrl={qualityPicker.logoUrl}
              title={qualityPicker.title}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function QualityPicker(props: {
  title: string
  logoUrl?: string
  profiles: SelectOption[]
  onCancel: () => void
  onSelect: (qualityProfileId?: number) => void
}) {
  return (
    <div
      className="quality-picker-backdrop"
      onClick={(event) => {
        event.stopPropagation()
        props.onCancel()
      }}
      role="presentation"
    >
      <section
        aria-label={`Select quality for ${props.title}`}
        aria-modal="true"
        className="quality-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {props.logoUrl ? <img alt={props.title} className="quality-picker-logo" src={props.logoUrl} /> : <h3>{props.title}</h3>}
        <p className="quality-picker-label">Select quality:</p>
        <div className="quality-picker-options">
          <button onClick={() => props.onSelect()} type="button">Auto <span>Best version available</span></button>
          {props.profiles.map((profile) => (
            <button key={profile.id} onClick={() => props.onSelect(Number(profile.id))} type="button">{profile.label}</button>
          ))}
        </div>
      </section>
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

function CalendarGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" viewBox="0 0 16 16">
      <path d="M4.25 2.35h1.1v1.3h5.3v-1.3h1.1v1.3h1.05c.9 0 1.55.65 1.55 1.55v6.55c0 .9-.65 1.55-1.55 1.55H3.2c-.9 0-1.55-.65-1.55-1.55V5.2c0-.9.65-1.55 1.55-1.55h1.05v-1.3Zm-1.05 2.4c-.27 0-.45.18-.45.45v1.15h10.5V5.2c0-.27-.18-.45-.45-.45H3.2Zm10.05 2.7H2.75v4.3c0 .27.18.45.45.45h9.6c.27 0 .45-.18.45-.45v-4.3Z" fill="currentColor" />
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
      <circle cx="8" cy="8" fill="none" r="5.35" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.95 5.95 10.05 10.05M10.05 5.95 5.95 10.05" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
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

function SearchPage(props: {
  loading: boolean
  onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void
  onSearch: (query: string) => Promise<void>
  query: string
  results: MediaCard[]
  submittedQuery: string
  updateQuery: (query: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const hasSearched = Boolean(props.submittedQuery)

  return (
    <div className="search-page">
      <section className="search-header">
        <h2><SearchGlyph /> <span>Search</span></h2>
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault()
            void props.onSearch(props.query)
          }}
        >
          <input
            className="input search-input"
            onChange={(event) => props.updateQuery(event.target.value)}
            placeholder="Search movies and shows"
            ref={inputRef}
            type="search"
            value={props.query}
          />
          <ActionButton className="search-submit-button" disabled={props.loading || props.query.trim().length < 2} type="submit" variant="play">
            <ArrowRightGlyph />
          </ActionButton>
        </form>
      </section>

      {props.loading ? <LoadingHub /> : null}

      {hasSearched && !props.loading && props.results.length === 0 ? (
        <EmptyState
          copy={`No results found for "${props.submittedQuery}". Try another title or a broader query.`}
          title="Nothing matched"
        />
      ) : null}

      {props.results.length ? (
        <section className="search-results-section">
          <div className="search-results-grid">
            {props.results.map((card) => (
              <MediaTile
                busy={false}
                key={card.id}
                card={card}
                isContinueWatching={false}
                onOpenCard={props.onOpenCard}
                onRequest={async () => {}}
                styleType="landscape"
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function DownloadsPage(props: {
  downloads: DownloadItem[]
  processingItems: ProcessingItem[]
  completedDownloads: CompletedDownloadItem[]
  busyId: string
  onDelete: (id: string) => Promise<void>
  onDismissCompleted: (id: string) => void
  onDismissAllCompleted: () => void
}) {
  const hasAny = props.processingItems.length > 0 || props.downloads.length > 0 || props.completedDownloads.length > 0
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([])
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const selectedCount = selectedDownloadIds.length + selectedHistoryIds.length

  function toggleSelection(id: string, type: 'download' | 'history') {
    const update = type === 'download' ? setSelectedDownloadIds : setSelectedHistoryIds
    update((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  function closeSelectionMode() {
    setSelectionMode(false)
    setSelectedDownloadIds([])
    setSelectedHistoryIds([])
  }

  async function cancelSelectedDownloads() {
    if (!selectedDownloadIds.length || !window.confirm(`Cancel ${selectedDownloadIds.length} selected download${selectedDownloadIds.length === 1 ? '' : 's'}?`)) {
      return
    }

    setBatchBusy(true)
    try {
      await Promise.all(selectedDownloadIds.map((id) => props.onDelete(id)))
      setSelectedDownloadIds([])
    } finally {
      setBatchBusy(false)
    }
  }

  function dismissSelectedHistory() {
    if (!selectedHistoryIds.length || !window.confirm(`Delete ${selectedHistoryIds.length} selected history entr${selectedHistoryIds.length === 1 ? 'y' : 'ies'}?`)) {
      return
    }

    selectedHistoryIds.forEach((id) => props.onDismissCompleted(id))
    setSelectedHistoryIds([])
  }

  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2><DownloadGlyph /> <span>Downloads</span></h2>
        <button
          className={selectionMode ? 'downloads-selection-toggle is-active' : 'downloads-selection-toggle'}
          onClick={selectionMode ? closeSelectionMode : () => setSelectionMode(true)}
          type="button"
        >
          {selectionMode ? 'Done' : 'Select'}
        </button>
      </div>

      {selectionMode ? (
        <div className="downloads-selection-toolbar">
          <span>{selectedCount ? `${selectedCount} selected` : 'Select downloads or history entries'}</span>
          <div>
            {selectedDownloadIds.length ? <button disabled={batchBusy} onClick={() => void cancelSelectedDownloads()} type="button">Cancel downloads</button> : null}
            {selectedHistoryIds.length ? <button disabled={batchBusy} onClick={dismissSelectedHistory} type="button">Delete history</button> : null}
          </div>
        </div>
      ) : null}

      {props.processingItems.length > 0 ? (
        <section className="downloads-section">
          <h3 className="downloads-section-title">Processing</h3>
          <div className="downloads-grid">
            {props.processingItems.map((item) => (
              <article className="download-row download-row-processing" key={item.id}>
                  <div className="download-card">
                  <div className="download-artwork">
                    {item.posterUrl || item.backdropUrl
                      ? (
                        <picture>
                          {item.posterUrl ? <source media="(max-width: 980px)" srcSet={item.posterUrl} /> : null}
                          <img alt={item.title} loading="lazy" src={item.backdropUrl || item.posterUrl} />
                        </picture>
                      )
                      : <div className="media-fallback download-poster-fallback">{item.title.slice(0, 1).toUpperCase()}</div>}
                  </div>
                  <div className="download-copy">
                    <h4>{item.title}</h4>
                    {item.subtitle ? <p className="download-subtitle">{item.subtitle}</p> : null}
                    <p className="download-detail download-processing-label">
                      <span className="download-processing-spinner" aria-hidden="true" />
                      Searching…
                    </p>
                  </div>
                </div>
                <div className="download-side">
                  <div className="download-progress-panel">
                    <button
                      aria-label={`Dismiss ${item.title}`}
                      className="download-action-button download-delete-button download-history-dismiss-button"
                      onClick={() => props.onDismissCompleted(item.id)}
                      type="button"
                    >
                      ×
                    </button>
                    <div className="download-progress-header">
                      <span className="download-processing-badge">Processing</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {props.downloads.length > 0 ? (
        <section className="downloads-section">
          <h3 className="downloads-section-title">Downloading</h3>
          <div className="downloads-grid">
            {props.downloads.map((item) => (
              <DownloadRow
                busy={props.busyId === item.id}
                item={item}
                key={item.id}
                onDelete={props.onDelete}
                onToggleSelection={() => toggleSelection(item.id, 'download')}
                selected={selectedDownloadIds.includes(item.id)}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        </section>
      ) : null}

      {props.completedDownloads.length > 0 ? (
        <section className="downloads-section">
          <div className="downloads-section-header">
            <h3 className="downloads-section-title">History</h3>
            {!selectionMode ? <button aria-label="Dismiss history" className="downloads-dismiss-all-button" onClick={props.onDismissAllCompleted} title="Dismiss history" type="button">
              ×
            </button> : null}
          </div>
          <div className="downloads-grid">
            {props.completedDownloads.map((item) => (
              <article className={`${item.status === 'cancelled' ? 'download-row download-row-cancelled' : 'download-row download-row-completed'}${selectionMode ? ' is-selecting' : ''}`} key={item.id}>
                {selectionMode ? (
                  <button
                    aria-label={`Select ${item.title}`}
                    aria-pressed={selectedHistoryIds.includes(item.id)}
                    className={selectedHistoryIds.includes(item.id) ? 'download-selection-check is-selected' : 'download-selection-check'}
                    onClick={() => toggleSelection(item.id, 'history')}
                    type="button"
                  >
                    {selectedHistoryIds.includes(item.id) ? '✓' : null}
                  </button>
                ) : (
                  <button
                    aria-label={`Dismiss ${item.title}`}
                    className="download-action-button download-delete-button download-history-dismiss-button"
                    onClick={() => props.onDismissCompleted(item.id)}
                    type="button"
                  >
                    ×
                  </button>
                )}
                <div className="download-card">
                  <div className="download-artwork">
                    {item.posterUrl || item.backdropUrl
                      ? (
                        <picture>
                          {item.posterUrl ? <source media="(max-width: 980px)" srcSet={item.posterUrl} /> : null}
                          <img alt={item.title} loading="lazy" src={item.backdropUrl || item.posterUrl} />
                        </picture>
                      )
                      : <div className="media-fallback download-poster-fallback">{item.title.slice(0, 1).toUpperCase()}</div>}
                  </div>
                  <div className="download-copy">
                    <h4>{item.title}</h4>
                    {item.subtitle ? <p className="download-subtitle">{item.subtitle}</p> : null}
                    <p className="download-detail download-completed-label">{item.status === 'cancelled' ? 'Download cancelled' : 'Download completed'}</p>
                  </div>
                </div>
                {item.status === 'completed' ? (
                  <div className="download-side">
                    <div className="download-progress-panel">
                      <div className="download-progress-header">
                        <strong className="download-completed-badge">100%</strong>
                        <span>Completed</span>
                      </div>
                      <div className="download-progress-row">
                        <div className="download-progress-bar download-progress-complete">
                          <div className="download-progress-fill" style={{ width: '100%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!hasAny ? (
        <section className="downloads-section downloads-empty-section">
          <div className="downloads-empty-state">
            <div aria-hidden="true" className="downloads-empty-icon">
              <DownloadGlyph />
              <span />
            </div>
            <h4>No active downloads</h4>
            <p>The queue will appear here as soon as your services start working.</p>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function DownloadRow(props: {
  item: DownloadItem
  busy: boolean
  onDelete: (id: string) => Promise<void>
  selectionMode: boolean
  selected: boolean
  onToggleSelection: () => void
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
    <article className={props.selectionMode ? 'download-row is-selecting' : 'download-row'}>
      {props.selectionMode ? (
        <button
          aria-label={`Select ${item.title}`}
          aria-pressed={props.selected}
          className={props.selected ? 'download-selection-check is-selected' : 'download-selection-check'}
          onClick={props.onToggleSelection}
          type="button"
        >
          {props.selected ? '✓' : null}
        </button>
      ) : null}
      <div className="download-card">
        <div className="download-artwork">
          {artwork ? (
            <picture>
              {item.posterUrl ? <source media="(max-width: 980px)" srcSet={item.posterUrl} /> : null}
              <img alt={item.title} loading="lazy" src={artwork} />
            </picture>
          ) : <div className="media-fallback download-poster-fallback">{item.title.slice(0, 1).toUpperCase()}</div>}
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
            {!props.selectionMode ? <button
              aria-label={`Delete ${item.title}`}
              className="download-action-button download-delete-button"
              disabled={props.busy}
              onClick={confirmDelete}
              type="button"
            >
              {props.busy ? '…' : '×'}
            </button> : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function ArrowLeftGlyph() {
  return (
    <svg aria-hidden="true" className="sidebar-glyph-icon" fill="none" viewBox="0 0 16 16">
      <path d="M13 8H3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M6.75 4.25L3 8L6.75 11.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}

function CalendarPage(props: {
  onOpenCard: (card: MediaCard, originRect?: ModalOriginRect | null) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nextUpRef = useRef<HTMLButtonElement>(null);
  const [monthTransition, setMonthTransition] = useState<'idle' | 'next' | 'prev'>('idle');

  useEffect(() => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    let cancelled = false;
    setLoading(true);
    setError('');

    api.getCalendar(start, end)
      .then((response) => {
        if (!cancelled) {
          setEntries(response.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load calendar');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  useEffect(() => {
    if (monthTransition === 'idle') {
      return;
    }

    const timeout = setTimeout(() => {
      setCurrentDate(current => {
        const newDate = new Date(current);
        newDate.setDate(1);
        newDate.setMonth(newDate.getMonth() + (monthTransition === 'next' ? 1 : -1));
        return newDate;
      });
      setMonthTransition('idle');
    }, 400); // Match animation duration

    return () => clearTimeout(timeout);
  }, [monthTransition]);

  const now = new Date();

  const filteredEntries = entries.filter(entry => {
    const entryDate = new Date(entry.startsAt);
    return entryDate.getFullYear() === currentDate.getFullYear() && entryDate.getMonth() === currentDate.getMonth();
  });

  const nextUpEntry = filteredEntries.find(entry => new Date(entry.startsAt) >= now);
  const nextUpId = nextUpEntry?.id;

  const groups = groupCalendarEntries(filteredEntries);

  useLayoutEffect(() => {
    if (nextUpRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const element = nextUpRef.current;
      
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const scrollTop = element.offsetTop - container.offsetTop - (containerRect.height / 2) + (elementRect.height / 2);
      
      container.scrollTo({ top: scrollTop, behavior: 'auto' });
    }
  }, [groups]);

  function changeMonth(offset: number) {
    if (monthTransition !== 'idle') return;
    setMonthTransition(offset > 0 ? 'next' : 'prev');
  }
  
  if (loading && entries.length === 0) {
    return <LoadingHub />;
  }

  if (error) {
    return <EmptyState title="Error" copy={error} />;
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <button className="calendar-nav-button" onClick={() => changeMonth(-1)} disabled={monthTransition !== 'idle'}>
          <ArrowLeftGlyph />
        </button>
        <h2>{currentDate.toLocaleString('en-US', { month: 'long' })}</h2>
        <button className="calendar-nav-button" onClick={() => changeMonth(1)} disabled={monthTransition !== 'idle'}>
          <ArrowRightGlyph />
        </button>
      </div>
      <div className="calendar-container">
        <div className="calendar-scroll-container" ref={scrollContainerRef}>
          <div className={`calendar-groups ${monthTransition !== 'idle' ? `month-transition-${monthTransition}` : ''}`}>
            {groups.map((group) => (
              <section className="calendar-group" key={group.key}>
                <div className="calendar-group-header">
                  <strong>{group.label}</strong>
                </div>
                <div className="calendar-group-list">
                  {group.items.map((entry) => (
                    <button
                      ref={entry.id === nextUpId ? nextUpRef : null}
                      className={`calendar-entry-card ${entry.id === nextUpId ? 'is-next-up' : ''}`}
                      key={entry.id}
                      onClick={(event) => props.onOpenCard(entry.card, captureOriginRect(event.currentTarget))}
                      type="button"
                    >
                      <div className="calendar-entry-art">
                        {entry.imageUrl || entry.card.posterUrl ? (
                          <picture>
                            {entry.card.posterUrl ? <source media="(max-width: 980px)" srcSet={entry.card.posterUrl} /> : null}
                            <img alt={entry.title} loading="lazy" src={entry.imageUrl || entry.card.posterUrl} />
                          </picture>
                        ) : <div className="media-fallback">{entry.title.slice(0, 1).toUpperCase()}</div>}
                      </div>
                      <div className="calendar-entry-copy">
                        <h4>{entry.title}</h4>
                        <p className="calendar-entry-subtitle">{entry.subtitle}</p>
                        <p className="calendar-entry-detail">{entry.detail}</p>
                      </div>
                      <div className="calendar-entry-time">
                        <span>{formatCalendarTime(entry.startsAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function humanizeDownloadState(state: string) {
  return state
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function groupCalendarEntries(entries: CalendarEntry[]) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const grouped = new Map<string, { key: string; label: string; items: CalendarEntry[] }>()

  for (const entry of entries) {
    const date = new Date(entry.startsAt)
    const key = date.toISOString().slice(0, 10)
    const current = grouped.get(key)
    if (current) {
      current.items.push(entry)
      continue
    }
    grouped.set(key, {
      key,
      label: formatter.format(date),
      items: [entry],
    })
  }

  return [...grouped.values()]
}

function formatCalendarTime(startsAt: string) {
  const date = new Date(startsAt)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function AdministrationScreen(props: {
  config: AppConfig
  connections: ConnectionStatus[]
  jellyfinUsersBusy: boolean
  onExit: () => void
  onLoadJellyfinUsers: () => Promise<void>
  updateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void
  options: ServiceOptionsResponse
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>
  busy: boolean
}) {
  return (
    <div className="administration-layout">
      <header className="administration-header">
        <button aria-label="Back to profiles" className="administration-back-button" onClick={props.onExit} title="Back to profiles" type="button">
          <ArrowLeftGlyph />
        </button>
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Settings</h1>
        </div>
        <button aria-label="Save settings" className={props.busy ? 'administration-save-button is-saving' : 'administration-save-button'} disabled={props.busy} form="administration-settings" title="Save settings" type="submit">
          <CheckGlyph />
        </button>
      </header>
      <SettingsView
        busy={props.busy}
        config={props.config}
        connections={props.connections}
        jellyfinUsersBusy={props.jellyfinUsersBusy}
        onLoadJellyfinUsers={props.onLoadJellyfinUsers}
        onSave={props.onSave}
        options={props.options}
        formId="administration-settings"
        showSubmit={false}
        updateConfig={props.updateConfig}
      />
    </div>
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
  formId?: string
  showSubmit?: boolean
}) {
  return (
    <form className="settings-page" id={props.formId} onSubmit={(event) => void props.onSave(event)}>
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
        <QualityProfileVisibility
          profiles={props.options.sonarrQualityProfiles}
          selectedProfileIds={props.config.preferences.sonarrDownloadQualityProfileIds}
          onChange={(sonarrDownloadQualityProfileIds) => props.updateConfig('preferences', {
            ...props.config.preferences,
            sonarrDownloadQualityProfileIds,
          })}
        />
      </SettingsCard>

      <SettingsCard title="Radarr">
        <ServiceFields
          apiKey={props.config.radarr.apiKey}
          baseUrl={props.config.radarr.baseUrl}
          onApiKeyChange={(apiKey) => props.updateConfig('radarr', { ...props.config.radarr, apiKey })}
          onBaseUrlChange={(baseUrl) => props.updateConfig('radarr', { ...props.config.radarr, baseUrl })}
        />
        <QualityProfileVisibility
          profiles={props.options.radarrQualityProfiles}
          selectedProfileIds={props.config.preferences.radarrDownloadQualityProfileIds}
          onChange={(radarrDownloadQualityProfileIds) => props.updateConfig('preferences', {
            ...props.config.preferences,
            radarrDownloadQualityProfileIds,
          })}
        />
      </SettingsCard>

      <SettingsCard title="TMDb">
        <label>
          Bearer token
          <input className="input" onChange={(event) => props.updateConfig('tmdb', { bearerToken: event.target.value })} placeholder="Optional if already provided via TMDB_BEARER_TOKEN" value={props.config.tmdb.bearerToken} />
        </label>
      </SettingsCard>

      <SettingsCard title="TVDB">
        <label>
          API key
          <input className="input" onChange={(event) => props.updateConfig('tvdb', { apiKey: event.target.value })} placeholder="Optional if already provided via TVDB_API_KEY" value={props.config.tvdb.apiKey} />
        </label>
      </SettingsCard>

      {props.showSubmit !== false ? <div className="actions-row">
        <button className="primary-button" disabled={props.busy} type="submit">
          {props.busy ? 'Saving…' : 'Save settings'}
        </button>
      </div> : null}
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

function QualityProfileVisibility(props: {
  profiles: SelectOption[]
  selectedProfileIds: string[]
  onChange: (profileIds: string[]) => void
}) {
  return (
    <fieldset className="quality-profile-visibility">
      <legend>Profiles shown when downloading</legend>
      <p>Auto is always available. Select the quality profiles users can choose.</p>
      {props.profiles.length ? (
        <div className="quality-profile-visibility-list">
          {props.profiles.map((profile) => {
            const checked = props.selectedProfileIds.includes(profile.id)
            return (
              <label key={profile.id}>
                <input
                  checked={checked}
                  onChange={() => props.onChange(checked
                    ? props.selectedProfileIds.filter((id) => id !== profile.id)
                    : [...props.selectedProfileIds, profile.id])}
                  type="checkbox"
                />
                <span>{profile.label}</span>
              </label>
            )
          })}
        </div>
      ) : <p>Save the service connection first to load its quality profiles.</p>}
    </fieldset>
  )
}

function EmptyState({ title, copy, className }: { title: string; copy: string; className?: string }) {
  return (
    <div className={className ? `empty-state ${className}` : 'empty-state'}>
      <h4>{title}</h4>
      {copy ? <p>{copy}</p> : null}
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
