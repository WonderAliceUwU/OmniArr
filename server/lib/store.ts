import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { WishlistEntry } from '../../shared/contracts.js';

interface StoredAdmin {
  passwordHash: string;
  passwordSalt: string;
  encryptionSalt: string;
  createdAt: string;
}

interface EncryptedConfig {
  iv: string;
  data: string;
}

interface StoredState {
  version: 1 | 2;
  admin: StoredAdmin | null;
  config: EncryptedConfig | null;
  configKey: string | null;
  /** Each profile's wishlist, keyed by its Jellyfin user id ('admin' for the administrator). */
  wishlists: Record<string, WishlistEntry[]>;
}

const DATA_DIR = resolve(process.env.OMNIARR_DATA_DIR || resolve(process.cwd(), 'data'));
const STORE_FILE = resolve(DATA_DIR, 'omniarr.secure.json');
// The store used to be called aliceflix.secure.json; it is still read when the
// new file does not exist yet, so a rename never looks like a fresh install.
const LEGACY_STORE_FILE = resolve(DATA_DIR, 'aliceflix.secure.json');

const EMPTY_STATE: StoredState = {
  version: 1,
  admin: null,
  config: null,
  configKey: null,
  wishlists: {}
};

// Every write reads the file, changes it and writes it back, so writes are
// queued one after another; two profiles saving at once would otherwise drop
// one of the changes.
let writeQueue: Promise<unknown> = Promise.resolve();

async function readStoreFile(): Promise<string | null> {
  for (const file of [STORE_FILE, LEGACY_STORE_FILE]) {
    try {
      return await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return null;
}

// Only a store that does not exist counts as a fresh install. Any other read or
// parse failure is thrown: treating it as empty would reopen the master
// password setup and let the next visitor overwrite the real one.
export async function loadState(): Promise<StoredState> {
  const raw = await readStoreFile();
  if (raw === null) return EMPTY_STATE;

  const parsed = JSON.parse(raw) as Partial<StoredState>;

  return {
    version: parsed.configKey ? 2 : 1,
    admin: parsed.admin ?? null,
    config: parsed.config ?? null,
    configKey: typeof parsed.configKey === 'string' ? parsed.configKey : null,
    wishlists: parsed.wishlists && typeof parsed.wishlists === 'object' ? parsed.wishlists : {}
  };
}

export async function saveState(state: StoredState): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  // Written to a temporary file first, so a crash mid-write never leaves a
  // half-written store behind.
  const temporaryFile = `${STORE_FILE}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(state, null, 2), 'utf8');
  await rename(temporaryFile, STORE_FILE);
}

export function updateState(change: (state: StoredState) => StoredState): Promise<StoredState> {
  const next = writeQueue.then(async () => {
    const updated = change(await loadState());
    await saveState(updated);
    return updated;
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function readEncryptedConfig(): Promise<EncryptedConfig | null> {
  const state = await loadState();
  return state.config;
}

export async function saveAdminAndConfig(
  admin: StoredAdmin,
  config: EncryptedConfig,
  configKey: string
): Promise<void> {
  await updateState((state) => ({
    ...state,
    version: 2,
    admin,
    config,
    configKey
  }));
}

export async function updateEncryptedConfig(config: EncryptedConfig): Promise<void> {
  await updateState((state) => ({
    ...state,
    config
  }));
}

export async function readAdmin(): Promise<StoredAdmin | null> {
  const state = await loadState();
  return state.admin;
}

export async function migrateConfig(config: EncryptedConfig, configKey: string): Promise<void> {
  await updateState((state) => ({ ...state, version: 2, config, configKey }));
}

export async function readWishlist(owner: string): Promise<WishlistEntry[]> {
  const state = await loadState();
  return state.wishlists[owner] ?? [];
}

export async function updateWishlist(owner: string, change: (entries: WishlistEntry[]) => WishlistEntry[]): Promise<WishlistEntry[]> {
  const state = await updateState((current) => ({
    ...current,
    wishlists: { ...current.wishlists, [owner]: change(current.wishlists[owner] ?? []) }
  }));
  return state.wishlists[owner];
}

export async function readAllWishlists(): Promise<Record<string, WishlistEntry[]>> {
  const state = await loadState();
  return state.wishlists;
}

export async function restoreBackup(config: EncryptedConfig, wishlists: Record<string, WishlistEntry[]>): Promise<void> {
  await updateState((state) => ({ ...state, config, wishlists }));
}

export type { EncryptedConfig, StoredAdmin, StoredState };
