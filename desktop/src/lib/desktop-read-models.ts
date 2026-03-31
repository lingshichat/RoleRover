import {
  type DomainContractSummary,
  type ImporterDryRunSnapshot,
  type LegacyImportContract,
  type SecretVaultStatus,
  type StorageSnapshot,
  type WorkspaceSettingsDocument,
  type WorkspaceSnapshot,
} from "./desktop-api";
import { type HomeRouteData, type ImportsRouteData, type LibraryRouteData, type SettingsRouteData } from "./desktop-loaders";

function getTableRowCount(storage: StorageSnapshot, table: string): number {
  return storage.tableCounts.find((entry) => entry.table === table)?.rowCount ?? 0;
}

export interface HomeSurfaceReadModel {
  documentCount: number;
  sectionCount: number;
  sessionCount: number;
  analysisCount: number;
  detectedLegacySourceCount: number;
  importerState: ImporterDryRunSnapshot["result"]["state"];
  defaultProvider: WorkspaceSettingsDocument["ai"]["defaultProvider"];
  contractVersion: DomainContractSummary["contractVersion"];
  mappingCount: LegacyImportContract["tableMappings"]["length"];
}

export function toHomeSurfaceReadModel(data: HomeRouteData): HomeSurfaceReadModel {
  return {
    documentCount: getTableRowCount(data.storage, "documents"),
    sectionCount: getTableRowCount(data.storage, "document_sections"),
    sessionCount: getTableRowCount(data.storage, "ai_chat_sessions"),
    analysisCount: getTableRowCount(data.storage, "ai_analysis_records"),
    detectedLegacySourceCount: data.workspace.legacySources.filter((source) => source.exists)
      .length,
    importerState: data.importer.result.state,
    defaultProvider: data.settings.ai.defaultProvider,
    contractVersion: data.domainContract.contractVersion,
    mappingCount: data.importContract.tableMappings.length,
  };
}

export interface LibrarySurfaceReadModel {
  documentCount: number;
  sectionCount: number;
  sessionCount: number;
  messageCount: number;
  auditCount: number;
  detectedLegacySourceCount: number;
  supportedSectionTypeCount: number;
  mappingCount: number;
}

export function toLibrarySurfaceReadModel(
  data: LibraryRouteData,
): LibrarySurfaceReadModel {
  return {
    documentCount: getTableRowCount(data.storage, "documents"),
    sectionCount: getTableRowCount(data.storage, "document_sections"),
    sessionCount: getTableRowCount(data.storage, "ai_chat_sessions"),
    messageCount: getTableRowCount(data.storage, "ai_chat_messages"),
    auditCount: getTableRowCount(data.storage, "migration_audit"),
    detectedLegacySourceCount: data.workspace.legacySources.filter((source) => source.exists)
      .length,
    supportedSectionTypeCount: data.domainContract.supportedSectionTypes.length,
    mappingCount: data.importContract.tableMappings.length,
  };
}

export interface ImportsSurfaceReadModel {
  detectedLegacySourceCount: number;
  discoveredSourceCount: number;
  blockingIssueCount: number;
  warningIssueCount: number;
  readyForExecution: boolean;
  hasSqliteCandidate: boolean;
}

export function toImportsSurfaceReadModel(
  data: ImportsRouteData,
): ImportsSurfaceReadModel {
  return {
    detectedLegacySourceCount: data.workspace.legacySources.filter((source) => source.exists)
      .length,
    discoveredSourceCount: data.importer.plan.validation.totals.discoveredSources,
    blockingIssueCount: data.importer.plan.validation.totals.blockingIssues,
    warningIssueCount: data.importer.plan.validation.totals.warningIssues,
    readyForExecution: data.importer.result.state === "ready_for_execution",
    hasSqliteCandidate: data.importer.plan.discovery.sources.some(
      (source) => source.exists && source.sourceKind === "sqlite_database",
    ),
  };
}

export interface SettingsSurfaceReadModel {
  configuredProviderCount: number;
  defaultProvider: WorkspaceSettingsDocument["ai"]["defaultProvider"];
  vaultStatus: SecretVaultStatus["status"];
  vaultWarningCount: number;
  contractProviderCount: number;
  supportsEncryptedVault: boolean;
}

export function toSettingsSurfaceReadModel(
  data: SettingsRouteData,
): SettingsSurfaceReadModel {
  return {
    configuredProviderCount: Object.keys(data.settings.ai.providerConfigs).length,
    defaultProvider: data.settings.ai.defaultProvider,
    vaultStatus: data.vault.status,
    vaultWarningCount: data.vault.warnings.length,
    contractProviderCount: data.domainContract.defaultSettings.ai.providers.length,
    supportsEncryptedVault: data.vault.encryptedAtRest,
  };
}

export interface ProviderRuntimeReadModel {
  provider: string;
  model: string;
  baseUrl: string;
  secretKey: string | null;
  isDefault: boolean;
}

export function buildProviderRuntimeReadModel(
  settings: WorkspaceSettingsDocument,
  domainContract: DomainContractSummary,
): ProviderRuntimeReadModel[] {
  const contractByProvider = new Map<string, DomainContractSummary["defaultSettings"]["ai"]["providers"][number]>(
    domainContract.defaultSettings.ai.providers.map((provider) => [
      provider.provider,
      provider,
    ]),
  );
  const providers = new Set([
    ...Object.keys(settings.ai.providerConfigs),
    ...contractByProvider.keys(),
  ]);

  return Array.from(providers)
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

export function isWorkspaceReadyForNativeWorkflow(
  workspace: WorkspaceSnapshot,
): boolean {
  return workspace.bootstrapStatus === "created" || workspace.bootstrapStatus === "reused";
}
