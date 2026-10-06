export const DATA_SCHEMA_VERSION = 1;

export {
  ConfigFileSchema,
  ECOSYSTEM_CATEGORIES,
  EcosystemListSchema,
  EcosystemSchema,
  EcosystemTaxonomyEntrySchema,
  EcosystemTaxonomySchema,
  GuideCommandSchema,
  GuideVariantSchema,
  MirrorListSchema,
  MirrorSchema,
  MirrorSupportSchema,
  MirrorsStatusResponseSchema,
  ProbeConfigSchema,
  RESOURCE_KINDS,
  RESOURCE_PLATFORMS,
  RestoreSchema,
  SiteInventorySchema,
  SiteRepositoryGroupListSchema,
  SiteRepositoryGroupSchema,
  SiteRepositorySchema,
  SiteResourceListSchema,
  SiteResourceSchema,
  SourceInfoSchema,
  StatusSourceSchema,
  SyncSourceReportSchema,
  SyncStatusRecordSchema,
  TemplateVariableSchema,
  TroubleshootingListSchema,
  TroubleshootingSchema,
  TroubleshootingStepSchema,
  TutorialListSchema,
  TutorialSchema,
  VerificationSchema,
} from './schemas.js';

export type {
  ConfigFile,
  Ecosystem,
  EcosystemTaxonomyEntry,
  GuideCommand,
  GuideVariant,
  Mirror,
  MirrorSupport,
  MirrorsStatusResponse,
  ProbeConfig,
  Restore,
  SiteInventory,
  SiteRepository,
  SiteRepositoryGroup,
  SiteResource,
  SiteResourceList,
  SourceInfo,
  StatusSource,
  SyncSourceReport,
  SyncStatusRecord,
  TemplateVariable,
  Troubleshooting,
  Tutorial,
  Verification,
} from './schemas.js';

export { validateDataset } from './validation.js';
export type { Dataset, DatasetValidationIssue } from './validation.js';

export {
  DownloadPlatformSchema,
  DownloadPurposeSchema,
  RulePatternSchema,
  SoftwareIdentitySchema,
  DownloadMatchSchema,
  DownloadRuleSchema,
  DownloadTemplateSchema,
  DownloadBindingSchema,
  DownloadManifestSchema,
} from './downloadRules.js';
export type {
  DownloadRule,
  DownloadMatch,
  DownloadBinding,
  SoftwareIdentity,
} from './downloadRules.js';

export {
  TunaCatalogBindingSchema,
  TunaCatalogConfigSchema,
  TunaCatalogPayloadSchema,
} from './tunaCatalog.js';
export type { TunaCatalogBinding, TunaCatalogConfig } from './tunaCatalog.js';

export { VersionPolicySchema, VersionRuleSchema } from './versionPolicy.js';
export type { VersionPolicy, VersionRule } from './versionPolicy.js';

export * from './curation.js';
