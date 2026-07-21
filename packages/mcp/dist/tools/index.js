export const toolDefinitions = [
    {
        name: 'index_site_blocks',
        description: 'Discover all pages on an EDS site and build a block-usage index. Use this before querying block usage.',
        inputSchema: {
            type: 'object',
            properties: {
                baseUrl: {
                    type: 'string',
                    description: 'Live site origin URL (e.g. https://main--repo--owner.aem.live)',
                },
                pageSource: {
                    type: 'string',
                    enum: ['query-index', 'sitemap'],
                    description: 'How to discover pages (default: query-index)',
                },
                configPath: {
                    type: 'string',
                    description: 'Path to blockguard.config.yml (optional)',
                },
                outputDir: {
                    type: 'string',
                    description: 'Directory to save the index (default: /tmp/blockguard)',
                },
                refresh: {
                    type: 'boolean',
                    description: 'Force refresh even if a cached index exists',
                },
            },
            required: ['baseUrl'],
        },
    },
    {
        name: 'find_block_usage',
        description: 'Find all pages that use a specific EDS block, optionally filtered by variation or locale.',
        inputSchema: {
            type: 'object',
            properties: {
                block: {
                    type: 'string',
                    description: 'Block name to search for (e.g. "cards" or "hero")',
                },
                variation: {
                    type: 'string',
                    description: 'Specific variation to filter by (e.g. "featured")',
                },
                locale: {
                    type: 'string',
                    description: 'Locale to filter by (e.g. "en-us")',
                },
                indexPath: {
                    type: 'string',
                    description: 'Path to an existing block-usage-index.json file',
                },
            },
            required: ['block'],
        },
    },
    {
        name: 'analyze_code_change',
        description: 'Analyse a git diff to determine which EDS blocks changed and whether the impact is block-scoped or site-wide.',
        inputSchema: {
            type: 'object',
            properties: {
                baseRef: {
                    type: 'string',
                    description: 'Git base ref (default: origin/main)',
                },
                headRef: {
                    type: 'string',
                    description: 'Git head ref (default: HEAD)',
                },
                projectRoot: {
                    type: 'string',
                    description: 'Absolute path to the EDS project repo',
                },
            },
        },
    },
    {
        name: 'select_regression_pages',
        description: 'Given a list of changed block names, select the most representative pages for regression testing.',
        inputSchema: {
            type: 'object',
            properties: {
                changedBlocks: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of changed block names',
                },
                mode: {
                    type: 'string',
                    enum: ['representative', 'full'],
                    description: 'Selection mode (default: representative)',
                },
                maxPages: {
                    type: 'number',
                    description: 'Maximum pages to select (default: 20)',
                },
                indexPath: {
                    type: 'string',
                    description: 'Path to an existing block-usage-index.json',
                },
            },
            required: ['changedBlocks'],
        },
    },
    {
        name: 'run_block_regression',
        description: 'Run a full regression test for one or more blocks: screenshot live + preview, pixel diff, DOM diff, accessibility, and runtime checks.',
        inputSchema: {
            type: 'object',
            properties: {
                block: {
                    type: 'string',
                    description: 'Block name to test (e.g. "cards")',
                },
                baseRef: {
                    type: 'string',
                    description: 'Git base ref for impact analysis (default: origin/main)',
                },
                headRef: {
                    type: 'string',
                    description: 'Git head ref (default: HEAD)',
                },
                liveOrigin: {
                    type: 'string',
                    description: 'Live site origin URL',
                },
                previewOrigin: {
                    type: 'string',
                    description: 'Branch preview origin URL',
                },
                projectRoot: {
                    type: 'string',
                    description: 'Absolute path to the EDS project repo',
                },
                mode: {
                    type: 'string',
                    enum: ['representative', 'full'],
                    description: 'Page selection mode (default: representative)',
                },
                viewports: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Viewport names to test (default: ["mobile", "desktop"])',
                },
                outputDir: {
                    type: 'string',
                    description: 'Output directory for screenshots and report',
                },
            },
            required: ['block'],
        },
    },
    {
        name: 'get_regression_report',
        description: 'Retrieve a previously generated regression report by run ID or from a directory.',
        inputSchema: {
            type: 'object',
            properties: {
                runId: {
                    type: 'string',
                    description: 'The BlockGuard run ID (e.g. bg-20260721-001)',
                },
                reportPath: {
                    type: 'string',
                    description: 'Path to report.json or the report directory',
                },
                format: {
                    type: 'string',
                    enum: ['summary', 'full', 'markdown'],
                    description: 'Output format (default: summary)',
                },
            },
        },
    },
];
//# sourceMappingURL=index.js.map