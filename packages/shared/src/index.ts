export const DATA_SCHEMA_VERSION = 1;

export {
  ConfigFileSchema,
  EcosystemListSchema,
  EcosystemSchema,
  GuideCommandSchema,
  GuideVariantSchema,
  MirrorListSchema,
  MirrorSchema,
  MirrorSupportSchema,
  MirrorsStatusResponseSchema,
  ProbeConfigSchema,
  RestoreSchema,
  SourceInfoSchema,
  StatusSourceSchema,
  SyncSourceReportSchema,
  SyncStatusRecordSchema,
  TemplateVariableSchema,
  TroubleshootingListSchema,
  TroubleshootingSchema,
  TroubleshootingStepSchema,
  VerificationSchema,
} from './schemas.js';

export type {
  ConfigFile,
  Ecosystem,
  GuideCommand,
  GuideVariant,
  Mirror,
  MirrorSupport,
  MirrorsStatusResponse,
  ProbeConfig,
  Restore,
  SourceInfo,
  StatusSource,
  SyncSourceReport,
  SyncStatusRecord,
  TemplateVariable,
  Troubleshooting,
  Verification,
} from './schemas.js';

export { validateDataset } from './validation.js';
export type { Dataset, DatasetValidationIssue } from './validation.js';
