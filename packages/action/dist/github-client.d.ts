import * as github from '@actions/github';
type Octokit = ReturnType<typeof github.getOctokit>;
/**
 * Find an existing BlockGuard comment on the PR (identified by the marker).
 */
export declare function findExistingComment(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<number | null>;
/**
 * Upsert a PR comment — update if one exists, create if not.
 */
export declare function upsertPrComment(octokit: Octokit, owner: string, repo: string, prNumber: number, body: string): Promise<void>;
/**
 * Create or update a GitHub Check Run for the BlockGuard result.
 */
export declare function upsertCheckRun(octokit: Octokit, owner: string, repo: string, sha: string, status: 'passed' | 'warning' | 'failed', summary: string, reportUrl?: string): Promise<void>;
/**
 * Write a GitHub Actions job summary.
 */
export declare function writeJobSummary(core: {
    summary: {
        addRaw: (text: string) => {
            write: () => Promise<void>;
        };
    };
}, markdown: string): Promise<void>;
export {};
//# sourceMappingURL=github-client.d.ts.map