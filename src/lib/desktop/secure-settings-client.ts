const SECURE_PROVIDER_KEYS_STORAGE_KEY = 'jade_secure_provider_api_keys';
const SECURE_EXA_POOL_API_KEY_STORAGE_KEY = 'jade_secure_exa_pool_api_key';
const LEGACY_API_KEY_STORAGE_KEY = 'jade_api_key';
const LEGACY_EXA_POOL_CONFIG_STORAGE_KEY = 'jade_exa_pool_config';

type SecureSettingsBridge = {
  get?: (key: string) => string | null | Promise<string | null>;
  set?: (key: string, value: string) => void | Promise<void>;
  delete?: (key: string) => void | Promise<void>;
};

type SensitiveSettingsSnapshot = {
  providerApiKeys: Record<string, string>;
  exaPoolApiKey: string;
};

function getSecureBridge(): SecureSettingsBridge | null {
  if (typeof window === 'undefined') return null;
  return window.roleRoverDesktop?.secureSettings ?? null;
}

async function bridgeGetItem(key: string): Promise<string | null> {
  const bridge = getSecureBridge();
  if (!bridge?.get) return null;
  try {
    return (await bridge.get(key)) ?? null;
  } catch {
    return null;
  }
}

async function bridgeSetItem(key: string, value: string): Promise<boolean> {
  const bridge = getSecureBridge();
  if (!bridge?.set) return false;
  try {
    await bridge.set(key, value);
    return true;
  } catch {
    return false;
  }
}

async function bridgeRemoveItem(key: string): Promise<void> {
  const bridge = getSecureBridge();
  if (!bridge?.delete) return;
  try {
    await bridge.delete(key);
  } catch {
    // ignore
  }
}

function safeLocalGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeLocalRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseProviderApiKeys(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const safeResult: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        safeResult[key] = value;
      }
    }
    return safeResult;
  } catch {
    return {};
  }
}

async function readRawSecureValue(key: string): Promise<string | null> {
  const fromBridge = await bridgeGetItem(key);
  if (typeof fromBridge === 'string') return fromBridge;
  return safeLocalGetItem(key);
}

async function writeRawSecureValue(key: string, value: string): Promise<void> {
  const didWriteBridge = await bridgeSetItem(key, value);
  if (!didWriteBridge) {
    safeLocalSetItem(key, value);
  }
}

export async function loadSensitiveSettings(): Promise<SensitiveSettingsSnapshot> {
  const providerMapRaw = await readRawSecureValue(SECURE_PROVIDER_KEYS_STORAGE_KEY);
  const exaPoolApiKeyRaw = await readRawSecureValue(SECURE_EXA_POOL_API_KEY_STORAGE_KEY);

  const providerApiKeys = parseProviderApiKeys(providerMapRaw);
  let exaPoolApiKey = exaPoolApiKeyRaw ?? '';

  const legacyApiKey = safeLocalGetItem(LEGACY_API_KEY_STORAGE_KEY) ?? '';
  if (legacyApiKey && !providerApiKeys.openai) {
    providerApiKeys.openai = legacyApiKey;
    await writeRawSecureValue(
      SECURE_PROVIDER_KEYS_STORAGE_KEY,
      JSON.stringify(providerApiKeys)
    );
  }

  if (!exaPoolApiKey) {
    const legacyExaConfigRaw = safeLocalGetItem(LEGACY_EXA_POOL_CONFIG_STORAGE_KEY);
    if (legacyExaConfigRaw) {
      try {
        const legacyExaConfig = JSON.parse(legacyExaConfigRaw) as {
          apiKey?: string;
        };
        exaPoolApiKey = legacyExaConfig.apiKey || '';
        if (exaPoolApiKey) {
          await writeRawSecureValue(
            SECURE_EXA_POOL_API_KEY_STORAGE_KEY,
            exaPoolApiKey
          );
        }
      } catch {
        // ignore bad legacy payload
      }
    }
  }

  return {
    providerApiKeys,
    exaPoolApiKey,
  };
}

export async function persistProviderApiKey(
  provider: string,
  apiKey: string
): Promise<void> {
  const currentRaw = await readRawSecureValue(SECURE_PROVIDER_KEYS_STORAGE_KEY);
  const current = parseProviderApiKeys(currentRaw);

  if (apiKey) {
    current[provider] = apiKey;
  } else {
    delete current[provider];
  }

  await writeRawSecureValue(
    SECURE_PROVIDER_KEYS_STORAGE_KEY,
    JSON.stringify(current)
  );

  safeLocalRemoveItem(LEGACY_API_KEY_STORAGE_KEY);
}

export async function persistExaPoolApiKey(apiKey: string): Promise<void> {
  await writeRawSecureValue(SECURE_EXA_POOL_API_KEY_STORAGE_KEY, apiKey || '');

  const legacyExaConfigRaw = safeLocalGetItem(LEGACY_EXA_POOL_CONFIG_STORAGE_KEY);
  if (legacyExaConfigRaw) {
    try {
      const legacyExaConfig = JSON.parse(legacyExaConfigRaw) as {
        baseURL?: string;
      };
      if (legacyExaConfig.baseURL) {
        safeLocalSetItem(
          LEGACY_EXA_POOL_CONFIG_STORAGE_KEY,
          JSON.stringify({ baseURL: legacyExaConfig.baseURL, apiKey: '' })
        );
      } else {
        safeLocalRemoveItem(LEGACY_EXA_POOL_CONFIG_STORAGE_KEY);
      }
    } catch {
      safeLocalRemoveItem(LEGACY_EXA_POOL_CONFIG_STORAGE_KEY);
    }
  }
}

export async function clearSensitiveLocalFallback(): Promise<void> {
  await bridgeRemoveItem(LEGACY_API_KEY_STORAGE_KEY);
  await bridgeRemoveItem(LEGACY_EXA_POOL_CONFIG_STORAGE_KEY);
  safeLocalRemoveItem(LEGACY_API_KEY_STORAGE_KEY);
}
