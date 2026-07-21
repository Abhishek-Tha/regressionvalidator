export declare const toolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            baseUrl: {
                type: string;
                description: string;
            };
            pageSource: {
                type: string;
                enum: string[];
                description: string;
            };
            configPath: {
                type: string;
                description: string;
            };
            outputDir: {
                type: string;
                description: string;
            };
            refresh: {
                type: string;
                description: string;
            };
            block?: undefined;
            variation?: undefined;
            locale?: undefined;
            indexPath?: undefined;
            baseRef?: undefined;
            headRef?: undefined;
            projectRoot?: undefined;
            changedBlocks?: undefined;
            mode?: undefined;
            maxPages?: undefined;
            liveOrigin?: undefined;
            previewOrigin?: undefined;
            viewports?: undefined;
            runId?: undefined;
            reportPath?: undefined;
            format?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            block: {
                type: string;
                description: string;
            };
            variation: {
                type: string;
                description: string;
            };
            locale: {
                type: string;
                description: string;
            };
            indexPath: {
                type: string;
                description: string;
            };
            baseUrl?: undefined;
            pageSource?: undefined;
            configPath?: undefined;
            outputDir?: undefined;
            refresh?: undefined;
            baseRef?: undefined;
            headRef?: undefined;
            projectRoot?: undefined;
            changedBlocks?: undefined;
            mode?: undefined;
            maxPages?: undefined;
            liveOrigin?: undefined;
            previewOrigin?: undefined;
            viewports?: undefined;
            runId?: undefined;
            reportPath?: undefined;
            format?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            baseRef: {
                type: string;
                description: string;
            };
            headRef: {
                type: string;
                description: string;
            };
            projectRoot: {
                type: string;
                description: string;
            };
            baseUrl?: undefined;
            pageSource?: undefined;
            configPath?: undefined;
            outputDir?: undefined;
            refresh?: undefined;
            block?: undefined;
            variation?: undefined;
            locale?: undefined;
            indexPath?: undefined;
            changedBlocks?: undefined;
            mode?: undefined;
            maxPages?: undefined;
            liveOrigin?: undefined;
            previewOrigin?: undefined;
            viewports?: undefined;
            runId?: undefined;
            reportPath?: undefined;
            format?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            changedBlocks: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            mode: {
                type: string;
                enum: string[];
                description: string;
            };
            maxPages: {
                type: string;
                description: string;
            };
            indexPath: {
                type: string;
                description: string;
            };
            baseUrl?: undefined;
            pageSource?: undefined;
            configPath?: undefined;
            outputDir?: undefined;
            refresh?: undefined;
            block?: undefined;
            variation?: undefined;
            locale?: undefined;
            baseRef?: undefined;
            headRef?: undefined;
            projectRoot?: undefined;
            liveOrigin?: undefined;
            previewOrigin?: undefined;
            viewports?: undefined;
            runId?: undefined;
            reportPath?: undefined;
            format?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            block: {
                type: string;
                description: string;
            };
            baseRef: {
                type: string;
                description: string;
            };
            headRef: {
                type: string;
                description: string;
            };
            liveOrigin: {
                type: string;
                description: string;
            };
            previewOrigin: {
                type: string;
                description: string;
            };
            projectRoot: {
                type: string;
                description: string;
            };
            mode: {
                type: string;
                enum: string[];
                description: string;
            };
            viewports: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            outputDir: {
                type: string;
                description: string;
            };
            baseUrl?: undefined;
            pageSource?: undefined;
            configPath?: undefined;
            refresh?: undefined;
            variation?: undefined;
            locale?: undefined;
            indexPath?: undefined;
            changedBlocks?: undefined;
            maxPages?: undefined;
            runId?: undefined;
            reportPath?: undefined;
            format?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            runId: {
                type: string;
                description: string;
            };
            reportPath: {
                type: string;
                description: string;
            };
            format: {
                type: string;
                enum: string[];
                description: string;
            };
            baseUrl?: undefined;
            pageSource?: undefined;
            configPath?: undefined;
            outputDir?: undefined;
            refresh?: undefined;
            block?: undefined;
            variation?: undefined;
            locale?: undefined;
            indexPath?: undefined;
            baseRef?: undefined;
            headRef?: undefined;
            projectRoot?: undefined;
            changedBlocks?: undefined;
            mode?: undefined;
            maxPages?: undefined;
            liveOrigin?: undefined;
            previewOrigin?: undefined;
            viewports?: undefined;
        };
        required?: undefined;
    };
})[];
//# sourceMappingURL=index.d.ts.map