import {
  getDomainContractSummary,
  getImporterDryRun,
  getLegacyImportContract,
  getSecretVaultStatus,
  getStorageSnapshot,
  getWorkspaceSettingsSnapshot,
  getWorkspaceSnapshot,
  type DomainContractSummary,
  type ImporterDryRunSnapshot,
  type ProviderRuntimeContract,
  type SecretVaultStatus,
  type StorageSnapshot,
  type WorkspaceSettingsDocument,
  type WorkspaceSnapshot,
  type LegacyImportContract,
} from "./desktop-api";

export interface HomeRouteData {
  workspace: WorkspaceSnapshot;
  storage: StorageSnapshot;
  settings: WorkspaceSettingsDocument;
  domainContract: DomainContractSummary;
  importContract: LegacyImportContract;
  importer: ImporterDryRunSnapshot;
}

export interface LibraryRouteData {
  workspace: WorkspaceSnapshot;
  storage: StorageSnapshot;
  domainContract: DomainContractSummary;
  importContract: LegacyImportContract;
}

export interface ImportsRouteData {
  workspace: WorkspaceSnapshot;
  importer: ImporterDryRunSnapshot;
  importContract: LegacyImportContract;
}

export interface SettingsRouteData {
  workspace: WorkspaceSnapshot;
  settings: WorkspaceSettingsDocument;
  vault: SecretVaultStatus;
  domainContract: DomainContractSummary;
}

export interface ProviderRegistryEntry {
  provider: string;
  model: string;
  baseUrl: string;
  secretKey: string | null;
  isDefault: boolean;
}

export function countTableRows(storage: StorageSnapshot, table: string): number {
  return storage.tableCounts.find((entry) => entry.table === table)?.rowCount ?? 0;
}

export function getDetectedLegacySources(workspace: WorkspaceSnapshot) {
  return workspace.legacySources.filter((source) => source.exists);
}

export function getProviderRegistryEntries(
  settings: WorkspaceSettingsDocument,
  domainContract: DomainContractSummary,
): ProviderRegistryEntry[] {
  const contractByProvider = new Map<string, ProviderRuntimeContract>(
    domainContract.defaultSettings.ai.providers.map((provider) => [
      provider.provider,
      provider,
    ]),
  );
  const providerNames = new Set<string>([
    ...Object.keys(settings.ai.providerConfigs),
    ...contractByProvider.keys(),
  ]);

  return Array.from(providerNames)
    .sort((left, right) => left.localeCompare(right))
    .map((provider) => {
      const configured = settings.ai.providerConfigs[provider];
      const contract = contractByProvider.get(provider);

      return {
        provider,
        model: configured?.model ?? contract?.model ?? "unconfigured",
        baseUrl: configured?.baseUrl ?? contract?.baseUrl ?? "",
        secretKey: contract?.apiKeySecretKey ?? null,
        isDefault: settings.ai.defaultProvider === provider,
      };
    });
}

export async function loadHomeRouteData(): Promise<HomeRouteData> {
  const [workspace, storage, settings, domainContract, importContract, importer] =
    await Promise.all([
      getWorkspaceSnapshot(),
      getStorageSnapshot(),
      getWorkspaceSettingsSnapshot(),
      getDomainContractSummary(),
      getLegacyImportContract(),
      getImporterDryRun(),
    ]);

  return {
    workspace,
    storage,
    settings,
    domainContract,
    importContract,
    importer,
  };
}

export async function loadLibraryRouteData(): Promise<LibraryRouteData> {
  const [workspace, storage, domainContract, importContract] = await Promise.all([
    getWorkspaceSnapshot(),
    getStorageSnapshot(),
    getDomainContractSummary(),
    getLegacyImportContract(),
  ]);

  return {
    workspace,
    storage,
    domainContract,
    importContract,
  };
}

export async function loadImportsRouteData(): Promise<ImportsRouteData> {
  const [workspace, importer, importContract] = await Promise.all([
    getWorkspaceSnapshot(),
    getImporterDryRun(),
    getLegacyImportContract(),
  ]);

  return { workspace, importer, importContract };
}

export async function loadSettingsRouteData(): Promise<SettingsRouteData> {
  const [workspace, settings, vault, domainContract] = await Promise.all([
    getWorkspaceSnapshot(),
    getWorkspaceSettingsSnapshot(),
    getSecretVaultStatus(),
    getDomainContractSummary(),
  ]);

  return {
    workspace,
    settings,
    vault,
    domainContract,
  };
}
