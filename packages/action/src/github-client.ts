import * as github from '@actions/github';

type Octokit = ReturnType<typeof github.getOctokit>;

const COMMENT_MARKER = '<!-- blockguard-report-marker -->';

/**
 * Find an existing BlockGuard comment on the PR (identified by the marker).
 */
export async function findExistingComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<number | null> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));
  return existing?.id ?? null;
}

/**
 * Upsert a PR comment — update if one exists, create if not.
 */
export async function upsertPrComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const existingId = await findExistingComment(octokit, owner, repo, prNumber);

  if (existingId) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingId,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

/**
 * Create or update a GitHub Check Run for the BlockGuard result.
 */
export async function upsertCheckRun(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  status: 'passed' | 'warning' | 'failed',
  summary: string,
  reportUrl?: string,
): Promise<void> {
  const conclusion =
    status === 'passed' ? 'success' : status === 'warning' ? 'neutral' : 'failure';

  await octokit.rest.checks.create({
    owner,
    repo,
    name: 'BlockGuard Regression',
    head_sha: sha,
    status: 'completed',
    conclusion,
    output: {
      title: `BlockGuard: ${status.toUpperCase()}`,
      summary,
      text: reportUrl ? `[View full report](${reportUrl})` : undefined,
    },
  });
}

/**
 * Write a GitHub Actions job summary.
 */
export async function writeJobSummary(
  core: { summary: { addRaw: (text: string) => { write: () => Promise<void> } } },
  markdown: string,
): Promise<void> {
  await core.summary.addRaw(markdown).write();
}
