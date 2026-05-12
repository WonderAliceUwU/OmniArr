import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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
  version: 1;
  admin: StoredAdmin | null;
  config: EncryptedConfig | null;
}

const DATA_DIR = resolve(process.env.OMNIARR_DATA_DIR || resolve(process.cwd(), 'data'));
const STORE_FILE = resolve(DATA_DIR, 'omniarr.secure.json');

const EMPTY_STATE: StoredState = {
  version: 1,
  admin: null,
  config: null
};

export async function loadState(): Promise<StoredState> {
  try {
    const raw = await readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredState>;

    return {
      version: 1,
      admin: parsed.admin ?? null,
      config: parsed.config ?? null
    };
  } catch {
    return EMPTY_STATE;
  }
}

export async function saveState(state: StoredState): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function needsSetup(): Promise<boolean> {
  const state = await loadState();
  return !state.admin;
}

export async function readEncryptedConfig(): Promise<EncryptedConfig | null> {
  const state = await loadState();
  return state.config;
}

export async function saveAdminAndConfig(
  admin: StoredAdmin,
  config: EncryptedConfig
): Promise<void> {
  await saveState({
    version: 1,
    admin,
    config
  });
}

export async function updateEncryptedConfig(config: EncryptedConfig): Promise<void> {
  const state = await loadState();
  await saveState({
    ...state,
    config
  });
}

export async function readAdmin(): Promise<StoredAdmin | null> {
  const state = await loadState();
  return state.admin;
}

export type { EncryptedConfig, StoredAdmin, StoredState };
