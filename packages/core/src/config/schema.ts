import { z } from 'zod';

export const ViewportSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const BlockDetectionSchema = z.object({
  selector: z.string().default('.block'),
  nameStrategy: z.enum(['class', 'data-block-name']).default('class'),
  ignoredClasses: z.array(z.string()).default(['block', 'initialized', 'loading']),
  variationStrategy: z.enum(['remaining-classes', 'data-block-status']).default('remaining-classes'),
});

export const DiscoverySchema = z.object({
  pageIndex: z.string().optional(),
  sitemap: z.string().optional(),
  include: z.array(z.string()).default(['/**']),
  exclude: z.array(z.string()).default(['/drafts/**', '/tools/**']),
  maxDepth: z.number().int().positive().default(3),
});

export const SelectionSchema = z.object({
  mode: z.enum(['representative', 'full']).default('representative'),
  maximumPages: z.number().int().positive().default(20),
  includeEveryVariation: z.boolean().default(true),
  pagesPerVariation: z.number().int().positive().default(2),
  includeLocales: z.array(z.string()).optional(),
  prioritize: z
    .array(z.enum(['traffic', 'multiple-instances', 'longest-content', 'edge-cases']))
    .default(['traffic', 'multiple-instances']),
});

export const CaptureSchema = z.object({
  disableAnimations: z.boolean().default(true),
  waitForFonts: z.boolean().default(true),
  waitForImages: z.boolean().default(true),
  maskSelectors: z.array(z.string()).default(['.timestamp', '.personalized-content']),
  hideSelectors: z.array(z.string()).default(['.cookie-banner']),
  waitForSelectors: z.array(z.string()).default(['main .block']),
  delayMs: z.number().int().nonnegative().default(500),
  timezone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
});

export const ThresholdsSchema = z.object({
  visualWarning: z.number().nonnegative().default(0.5),
  visualFailure: z.number().nonnegative().default(3.0),
  newConsoleErrorsFailure: z.number().int().nonnegative().default(1),
  failOnNewCriticalAccessibilityIssue: z.boolean().default(true),
  failOnMissingBlock: z.boolean().default(true),
  failOnHorizontalOverflow: z.boolean().default(true),
});

export const SiteSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  baseBranch: z.string().default('main'),
  liveHost: z.string().optional(),
  previewHostPattern: z.string().optional(),
});

export const BlockGuardConfigSchema = z.object({
  version: z.literal(1),
  site: SiteSchema,
  discovery: DiscoverySchema.default({}),
  blockDetection: BlockDetectionSchema.default({}),
  selection: SelectionSchema.default({}),
  capture: CaptureSchema.default({}),
  viewports: z
    .array(ViewportSchema)
    .default([
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1440, height: 1000 },
    ]),
  thresholds: ThresholdsSchema.default({}),
  outputDir: z.string().default('/tmp/blockguard'),
});

export type BlockGuardConfig = z.infer<typeof BlockGuardConfigSchema>;
export type SiteConfig = z.infer<typeof SiteSchema>;
export type ViewportConfig = z.infer<typeof ViewportSchema>;
export type BlockDetectionConfig = z.infer<typeof BlockDetectionSchema>;
export type DiscoveryConfig = z.infer<typeof DiscoverySchema>;
export type SelectionConfig = z.infer<typeof SelectionSchema>;
export type CaptureConfig = z.infer<typeof CaptureSchema>;
export type ThresholdsConfig = z.infer<typeof ThresholdsSchema>;
