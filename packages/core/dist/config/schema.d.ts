import { z } from 'zod';
export declare const ViewportSchema: z.ZodObject<{
    name: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    name: string;
    width: number;
    height: number;
}, {
    name: string;
    width: number;
    height: number;
}>;
export declare const BlockDetectionSchema: z.ZodObject<{
    selector: z.ZodDefault<z.ZodString>;
    nameStrategy: z.ZodDefault<z.ZodEnum<["class", "data-block-name"]>>;
    ignoredClasses: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    variationStrategy: z.ZodDefault<z.ZodEnum<["remaining-classes", "data-block-status"]>>;
}, "strip", z.ZodTypeAny, {
    selector: string;
    nameStrategy: "class" | "data-block-name";
    ignoredClasses: string[];
    variationStrategy: "remaining-classes" | "data-block-status";
}, {
    selector?: string | undefined;
    nameStrategy?: "class" | "data-block-name" | undefined;
    ignoredClasses?: string[] | undefined;
    variationStrategy?: "remaining-classes" | "data-block-status" | undefined;
}>;
export declare const DiscoverySchema: z.ZodObject<{
    pageIndex: z.ZodOptional<z.ZodString>;
    sitemap: z.ZodOptional<z.ZodString>;
    include: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    maxDepth: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    include: string[];
    exclude: string[];
    maxDepth: number;
    pageIndex?: string | undefined;
    sitemap?: string | undefined;
}, {
    pageIndex?: string | undefined;
    sitemap?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    maxDepth?: number | undefined;
}>;
export declare const SelectionSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["representative", "full"]>>;
    maximumPages: z.ZodDefault<z.ZodNumber>;
    includeEveryVariation: z.ZodDefault<z.ZodBoolean>;
    pagesPerVariation: z.ZodDefault<z.ZodNumber>;
    includeLocales: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    prioritize: z.ZodDefault<z.ZodArray<z.ZodEnum<["traffic", "multiple-instances", "longest-content", "edge-cases"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    mode: "representative" | "full";
    maximumPages: number;
    includeEveryVariation: boolean;
    pagesPerVariation: number;
    prioritize: ("traffic" | "multiple-instances" | "longest-content" | "edge-cases")[];
    includeLocales?: string[] | undefined;
}, {
    mode?: "representative" | "full" | undefined;
    maximumPages?: number | undefined;
    includeEveryVariation?: boolean | undefined;
    pagesPerVariation?: number | undefined;
    includeLocales?: string[] | undefined;
    prioritize?: ("traffic" | "multiple-instances" | "longest-content" | "edge-cases")[] | undefined;
}>;
export declare const CaptureSchema: z.ZodObject<{
    disableAnimations: z.ZodDefault<z.ZodBoolean>;
    waitForFonts: z.ZodDefault<z.ZodBoolean>;
    waitForImages: z.ZodDefault<z.ZodBoolean>;
    maskSelectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    hideSelectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    waitForSelectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    delayMs: z.ZodDefault<z.ZodNumber>;
    timezone: z.ZodDefault<z.ZodString>;
    locale: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    disableAnimations: boolean;
    waitForFonts: boolean;
    waitForImages: boolean;
    maskSelectors: string[];
    hideSelectors: string[];
    waitForSelectors: string[];
    delayMs: number;
    timezone: string;
    locale: string;
}, {
    disableAnimations?: boolean | undefined;
    waitForFonts?: boolean | undefined;
    waitForImages?: boolean | undefined;
    maskSelectors?: string[] | undefined;
    hideSelectors?: string[] | undefined;
    waitForSelectors?: string[] | undefined;
    delayMs?: number | undefined;
    timezone?: string | undefined;
    locale?: string | undefined;
}>;
export declare const ThresholdsSchema: z.ZodObject<{
    visualWarning: z.ZodDefault<z.ZodNumber>;
    visualFailure: z.ZodDefault<z.ZodNumber>;
    newConsoleErrorsFailure: z.ZodDefault<z.ZodNumber>;
    failOnNewCriticalAccessibilityIssue: z.ZodDefault<z.ZodBoolean>;
    failOnMissingBlock: z.ZodDefault<z.ZodBoolean>;
    failOnHorizontalOverflow: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    visualWarning: number;
    visualFailure: number;
    newConsoleErrorsFailure: number;
    failOnNewCriticalAccessibilityIssue: boolean;
    failOnMissingBlock: boolean;
    failOnHorizontalOverflow: boolean;
}, {
    visualWarning?: number | undefined;
    visualFailure?: number | undefined;
    newConsoleErrorsFailure?: number | undefined;
    failOnNewCriticalAccessibilityIssue?: boolean | undefined;
    failOnMissingBlock?: boolean | undefined;
    failOnHorizontalOverflow?: boolean | undefined;
}>;
export declare const SiteSchema: z.ZodObject<{
    owner: z.ZodString;
    repo: z.ZodString;
    baseBranch: z.ZodDefault<z.ZodString>;
    liveHost: z.ZodOptional<z.ZodString>;
    previewHostPattern: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    owner: string;
    repo: string;
    baseBranch: string;
    liveHost?: string | undefined;
    previewHostPattern?: string | undefined;
}, {
    owner: string;
    repo: string;
    baseBranch?: string | undefined;
    liveHost?: string | undefined;
    previewHostPattern?: string | undefined;
}>;
export declare const BlockGuardConfigSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    site: z.ZodObject<{
        owner: z.ZodString;
        repo: z.ZodString;
        baseBranch: z.ZodDefault<z.ZodString>;
        liveHost: z.ZodOptional<z.ZodString>;
        previewHostPattern: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        owner: string;
        repo: string;
        baseBranch: string;
        liveHost?: string | undefined;
        previewHostPattern?: string | undefined;
    }, {
        owner: string;
        repo: string;
        baseBranch?: string | undefined;
        liveHost?: string | undefined;
        previewHostPattern?: string | undefined;
    }>;
    discovery: z.ZodDefault<z.ZodObject<{
        pageIndex: z.ZodOptional<z.ZodString>;
        sitemap: z.ZodOptional<z.ZodString>;
        include: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        maxDepth: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        include: string[];
        exclude: string[];
        maxDepth: number;
        pageIndex?: string | undefined;
        sitemap?: string | undefined;
    }, {
        pageIndex?: string | undefined;
        sitemap?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        maxDepth?: number | undefined;
    }>>;
    blockDetection: z.ZodDefault<z.ZodObject<{
        selector: z.ZodDefault<z.ZodString>;
        nameStrategy: z.ZodDefault<z.ZodEnum<["class", "data-block-name"]>>;
        ignoredClasses: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        variationStrategy: z.ZodDefault<z.ZodEnum<["remaining-classes", "data-block-status"]>>;
    }, "strip", z.ZodTypeAny, {
        selector: string;
        nameStrategy: "class" | "data-block-name";
        ignoredClasses: string[];
        variationStrategy: "remaining-classes" | "data-block-status";
    }, {
        selector?: string | undefined;
        nameStrategy?: "class" | "data-block-name" | undefined;
        ignoredClasses?: string[] | undefined;
        variationStrategy?: "remaining-classes" | "data-block-status" | undefined;
    }>>;
    selection: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["representative", "full"]>>;
        maximumPages: z.ZodDefault<z.ZodNumber>;
        includeEveryVariation: z.ZodDefault<z.ZodBoolean>;
        pagesPerVariation: z.ZodDefault<z.ZodNumber>;
        includeLocales: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        prioritize: z.ZodDefault<z.ZodArray<z.ZodEnum<["traffic", "multiple-instances", "longest-content", "edge-cases"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        mode: "representative" | "full";
        maximumPages: number;
        includeEveryVariation: boolean;
        pagesPerVariation: number;
        prioritize: ("traffic" | "multiple-instances" | "longest-content" | "edge-cases")[];
        includeLocales?: string[] | undefined;
    }, {
        mode?: "representative" | "full" | undefined;
        maximumPages?: number | undefined;
        includeEveryVariation?: boolean | undefined;
        pagesPerVariation?: number | undefined;
        includeLocales?: string[] | undefined;
        prioritize?: ("traffic" | "multiple-instances" | "longest-content" | "edge-cases")[] | undefined;
    }>>;
    capture: z.ZodDefault<z.ZodObject<{
        disableAnimations: z.ZodDefault<z.ZodBoolean>;
        waitForFonts: z.ZodDefault<z.ZodBoolean>;
        waitForImages: z.ZodDefault<z.ZodBoolean>;
        maskSelectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        hideSelectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        waitForSelectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        delayMs: z.ZodDefault<z.ZodNumber>;
        timezone: z.ZodDefault<z.ZodString>;
        locale: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        disableAnimations: boolean;
        waitForFonts: boolean;
        waitForImages: boolean;
        maskSelectors: string[];
        hideSelectors: string[];
        waitForSelectors: string[];
        delayMs: number;
        timezone: string;
        locale: string;
    }, {
        disableAnimations?: boolean | undefined;
        waitForFonts?: boolean | undefined;
        waitForImages?: boolean | undefined;
        maskSelectors?: string[] | undefined;
        hideSelectors?: string[] | undefined;
        waitForSelectors?: string[] | undefined;
        delayMs?: number | undefined;
        timezone?: string | undefined;
        locale?: string | undefined;
    }>>;
    viewports: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        width: number;
        height: number;
    }, {
        name: string;
        width: number;
        height: number;
    }>, "many">>;
    thresholds: z.ZodDefault<z.ZodObject<{
        visualWarning: z.ZodDefault<z.ZodNumber>;
        visualFailure: z.ZodDefault<z.ZodNumber>;
        newConsoleErrorsFailure: z.ZodDefault<z.ZodNumber>;
        failOnNewCriticalAccessibilityIssue: z.ZodDefault<z.ZodBoolean>;
        failOnMissingBlock: z.ZodDefault<z.ZodBoolean>;
        failOnHorizontalOverflow: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        visualWarning: number;
        visualFailure: number;
        newConsoleErrorsFailure: number;
        failOnNewCriticalAccessibilityIssue: boolean;
        failOnMissingBlock: boolean;
        failOnHorizontalOverflow: boolean;
    }, {
        visualWarning?: number | undefined;
        visualFailure?: number | undefined;
        newConsoleErrorsFailure?: number | undefined;
        failOnNewCriticalAccessibilityIssue?: boolean | undefined;
        failOnMissingBlock?: boolean | undefined;
        failOnHorizontalOverflow?: boolean | undefined;
    }>>;
    outputDir: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    site: {
        owner: string;
        repo: string;
        baseBranch: string;
        liveHost?: string | undefined;
        previewHostPattern?: string | undefined;
    };
    discovery: {
        include: string[];
        exclude: string[];
        maxDepth: number;
        pageIndex?: string | undefined;
        sitemap?: string | undefined;
    };
    blockDetection: {
        selector: string;
        nameStrategy: "class" | "data-block-name";
        ignoredClasses: string[];
        variationStrategy: "remaining-classes" | "data-block-status";
    };
    selection: {
        mode: "representative" | "full";
        maximumPages: number;
        includeEveryVariation: boolean;
        pagesPerVariation: number;
        prioritize: ("traffic" | "multiple-instances" | "longest-content" | "edge-cases")[];
        includeLocales?: string[] | undefined;
    };
    capture: {
        disableAnimations: boolean;
        waitForFonts: boolean;
        waitForImages: boolean;
        maskSelectors: string[];
        hideSelectors: string[];
        waitForSelectors: string[];
        delayMs: number;
        timezone: string;
        locale: string;
    };
    viewports: {
        name: string;
        width: number;
        height: number;
    }[];
    thresholds: {
        visualWarning: number;
        visualFailure: number;
        newConsoleErrorsFailure: number;
        failOnNewCriticalAccessibilityIssue: boolean;
        failOnMissingBlock: boolean;
        failOnHorizontalOverflow: boolean;
    };
    outputDir: string;
}, {
    version: 1;
    site: {
        owner: string;
        repo: string;
        baseBranch?: string | undefined;
        liveHost?: string | undefined;
        previewHostPattern?: string | undefined;
    };
    discovery?: {
        pageIndex?: string | undefined;
        sitemap?: string | undefined;
        include?: string[] | undefined;
        exclude?: string[] | undefined;
        maxDepth?: number | undefined;
    } | undefined;
    blockDetection?: {
        selector?: string | undefined;
        nameStrategy?: "class" | "data-block-name" | undefined;
        ignoredClasses?: string[] | undefined;
        variationStrategy?: "remaining-classes" | "data-block-status" | undefined;
    } | undefined;
    selection?: {
        mode?: "representative" | "full" | undefined;
        maximumPages?: number | undefined;
        includeEveryVariation?: boolean | undefined;
        pagesPerVariation?: number | undefined;
        includeLocales?: string[] | undefined;
        prioritize?: ("traffic" | "multiple-instances" | "longest-content" | "edge-cases")[] | undefined;
    } | undefined;
    capture?: {
        disableAnimations?: boolean | undefined;
        waitForFonts?: boolean | undefined;
        waitForImages?: boolean | undefined;
        maskSelectors?: string[] | undefined;
        hideSelectors?: string[] | undefined;
        waitForSelectors?: string[] | undefined;
        delayMs?: number | undefined;
        timezone?: string | undefined;
        locale?: string | undefined;
    } | undefined;
    viewports?: {
        name: string;
        width: number;
        height: number;
    }[] | undefined;
    thresholds?: {
        visualWarning?: number | undefined;
        visualFailure?: number | undefined;
        newConsoleErrorsFailure?: number | undefined;
        failOnNewCriticalAccessibilityIssue?: boolean | undefined;
        failOnMissingBlock?: boolean | undefined;
        failOnHorizontalOverflow?: boolean | undefined;
    } | undefined;
    outputDir?: string | undefined;
}>;
export type BlockGuardConfig = z.infer<typeof BlockGuardConfigSchema>;
export type SiteConfig = z.infer<typeof SiteSchema>;
export type ViewportConfig = z.infer<typeof ViewportSchema>;
export type BlockDetectionConfig = z.infer<typeof BlockDetectionSchema>;
export type DiscoveryConfig = z.infer<typeof DiscoverySchema>;
export type SelectionConfig = z.infer<typeof SelectionSchema>;
export type CaptureConfig = z.infer<typeof CaptureSchema>;
export type ThresholdsConfig = z.infer<typeof ThresholdsSchema>;
//# sourceMappingURL=schema.d.ts.map