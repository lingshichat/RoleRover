import { create } from 'zustand';
import {
  loadSensitiveSettings,
  persistExaPoolApiKey,
  persistProviderApiKey,
} from '@/lib/desktop/secure-settings-client';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

interface SettingsStore {
  // AI settings
  aiProvider: AIProvider;
  aiApiKey: string; // stored locally only, never sent to server
  aiBaseURL: string;
  aiModel: string;
  exaPoolBaseURL: string;
  exaPoolApiKey: string;
  // Editor settings
  autoSave: boolean;
  autoSaveInterval: number; // in milliseconds

  // Hydration state
  _hydrated: boolean;
  _syncing: boolean;

  // Actions
  setAIProvider: (provider: AIProvider) => void;
  setAIApiKey: (key: string) => void;
  setAIBaseURL: (url: string) => void;
  setAIModel: (model: string) => void;
  setExaPoolBaseURL: (url: string) => void;
  setExaPoolApiKey: (key: string) => void;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  hydrate: () => void;
}

const EXA_POOL_CONFIG_STORAGE_KEY = 'jade_exa_pool_config';
const PROVIDER_CONFIGS_KEY = 'jade_provider_configs';

interface ProviderConfig {
  baseURL: string;
  model: string;
}

const PROVIDER_DEFAULTS: Record<AIProvider, ProviderConfig> = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
};

let providerApiKeyCache: Partial<Record<AIProvider, string>> = {};
let hydratedSensitiveSettings = false;

function loadProviderConfigs(): Partial<Record<AIProvider, ProviderConfig>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProviderConfigs(configs: Partial<Record<AIProvider, ProviderConfig>>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PROVIDER_CONFIGS_KEY, JSON.stringify(configs)); } catch { /* ignore */ }
}

function getFingerprint(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jade_fingerprint');
}

function getHeaders(): Record<string, string> {
  const fp = getFingerprint();
  return {
    'Content-Type': 'application/json',
    ...(fp ? { 'x-fingerprint': fp } : {}),
  };
}

// Sync settings to server (debounced)
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function syncToServer(state: SettingsStore) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await fetch('/api/user/settings', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          aiProvider: state.aiProvider,
          aiBaseURL: state.aiBaseURL,
          aiModel: state.aiModel,
          autoSave: state.autoSave,
          autoSaveInterval: state.autoSaveInterval,
        }),
      });
    } catch {
      // silently fail, local state is still correct
    }
  }, 500);
}

function syncProviderConfig(state: SettingsStore) {
  const configs = loadProviderConfigs();
  configs[state.aiProvider] = {
    baseURL: state.aiBaseURL,
    model: state.aiModel,
  };
  saveProviderConfigs(configs);
}

function loadExaPoolBaseURLLocally(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(EXA_POOL_CONFIG_STORAGE_KEY);
    if (!raw) return '';

    const parsed = JSON.parse(raw) as { baseURL?: string };
    return parsed.baseURL || '';
  } catch {
    return '';
  }
}

function saveExaPoolBaseURLLocally(baseURL: string) {
  if (typeof window === 'undefined') return;
  try {
    if (!baseURL) {
      localStorage.removeItem(EXA_POOL_CONFIG_STORAGE_KEY);
      return;
    }

    localStorage.setItem(EXA_POOL_CONFIG_STORAGE_KEY, JSON.stringify({ baseURL }));
  } catch { /* ignore */ }
}

export function getAIHeaders(): Record<string, string> {
  const { aiProvider, aiApiKey, aiBaseURL, aiModel, exaPoolBaseURL, exaPoolApiKey } = useSettingsStore.getState();
  const headers: Record<string, string> = {};
  if (aiProvider) headers['x-provider'] = aiProvider;
  if (aiApiKey) headers['x-api-key'] = aiApiKey;
  if (aiBaseURL) headers['x-base-url'] = aiBaseURL;
  if (aiModel) headers['x-model'] = aiModel;
  if (exaPoolBaseURL) headers['x-exa-pool-base-url'] = exaPoolBaseURL;
  if (exaPoolApiKey) headers['x-exa-pool-api-key'] = exaPoolApiKey;
  return headers;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseURL: 'https://api.openai.com/v1',
  aiModel: 'gpt-4o',
  exaPoolBaseURL: '',
  exaPoolApiKey: '',
  autoSave: true,
  autoSaveInterval: 500,
  _hydrated: false,
  _syncing: false,

  setAIProvider: (provider) => {
    const { aiProvider: prev, aiBaseURL, aiModel, aiApiKey } = get();

    // Save current provider's config before switching
    const configs = loadProviderConfigs();
    configs[prev] = { baseURL: aiBaseURL, model: aiModel };
    saveProviderConfigs(configs);
    providerApiKeyCache[prev] = aiApiKey;
    void persistProviderApiKey(prev, aiApiKey);

    // Restore target provider's cached config, or use defaults
    const cached = configs[provider];
    const defaults = PROVIDER_DEFAULTS[provider];
    const restored = cached || defaults;
    const restoredApiKey = providerApiKeyCache[provider] || '';

    set({
      aiProvider: provider,
      aiBaseURL: restored.baseURL,
      aiModel: restored.model,
      aiApiKey: restoredApiKey,
    });
    syncToServer(get());
  },

  setAIApiKey: (key) => {
    set({ aiApiKey: key });
    const { aiProvider } = get();
    providerApiKeyCache[aiProvider] = key;
    void persistProviderApiKey(aiProvider, key);
    syncProviderConfig(get());
  },

  setAIBaseURL: (url) => {
    set({ aiBaseURL: url });
    syncToServer(get());
    syncProviderConfig(get());
  },

  setAIModel: (model) => {
    set({ aiModel: model });
    syncToServer(get());
    syncProviderConfig(get());
  },

  setExaPoolBaseURL: (url) => {
    set({ exaPoolBaseURL: url });
    saveExaPoolBaseURLLocally(url);
  },

  setExaPoolApiKey: (key) => {
    set({ exaPoolApiKey: key });
    void persistExaPoolApiKey(key);
  },

  setAutoSave: (enabled) => {
    set({ autoSave: enabled });
    syncToServer(get());
  },

  setAutoSaveInterval: (interval) => {
    set({ autoSaveInterval: interval });
    syncToServer(get());
  },

  hydrate: async () => {
    if (get()._hydrated) return;

    if (!hydratedSensitiveSettings) {
      const sensitive = await loadSensitiveSettings();
      providerApiKeyCache = sensitive.providerApiKeys as Partial<Record<AIProvider, string>>;
      hydratedSensitiveSettings = true;
      set({
        aiApiKey: providerApiKeyCache[get().aiProvider] || '',
        exaPoolApiKey: sensitive.exaPoolApiKey,
      });
    }

    const exaPoolBaseURL = loadExaPoolBaseURLLocally();
    set({
      exaPoolBaseURL,
    });

    // Load other settings from server
    try {
      const res = await fetch('/api/user/settings', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        // Backward compat: map legacy 'custom' provider to 'openai'
        const provider = (data.aiProvider === 'custom' || data.aiProvider === 'azure') ? 'openai' : data.aiProvider;
        const nextProvider = provider as AIProvider | undefined;
        set({
          ...(provider && { aiProvider: provider }),
          ...(nextProvider && { aiApiKey: providerApiKeyCache[nextProvider] || '' }),
          ...(data.aiBaseURL && { aiBaseURL: data.aiBaseURL }),
          ...(data.aiModel && { aiModel: data.aiModel }),
          ...(typeof data.autoSave === 'boolean' && { autoSave: data.autoSave }),
          ...(typeof data.autoSaveInterval === 'number' && { autoSaveInterval: data.autoSaveInterval }),
          _hydrated: true,
        });
        // Seed provider config cache with hydrated values
        syncProviderConfig(get());
        return;
      }
    } catch { /* fall through */ }

    set({ _hydrated: true });
  },
}));

// Auto-hydrate on client side so settings are ready before any component uses them
if (typeof window !== 'undefined') {
  useSettingsStore.getState().hydrate();
}
