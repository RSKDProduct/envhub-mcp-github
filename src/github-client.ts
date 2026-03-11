/**
 * GitHub REST API Client
 *
 * Wraps the GitHub REST API with Bearer token auth, rate limit tracking,
 * GitHub Enterprise support, and 30-second request timeout.
 */

export interface GitHubRateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

const DEFAULT_BASE_URL = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;
const RATE_LIMIT_THRESHOLD = 10;

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private lastRateLimit: GitHubRateLimitInfo | null = null;

  constructor(token: string, baseUrl?: string) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = token;
  }

  /** 1. List repositories for authenticated user or organization */
  async listRepos(params: { org?: string; page?: number; perPage?: number }): Promise<unknown> {
    const { org, page = 1, perPage = 30 } = params;
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(Math.min(perPage, 100)),
      sort: 'updated',
      direction: 'desc',
    });
    const path = org ? `/orgs/${encodeURIComponent(org)}/repos` : '/user/repos';
    return this.request('GET', `${path}?${query}`);
  }

  /** 2. Get a single repository by owner and name */
  async getRepo(params: { owner: string; repo: string }): Promise<unknown> {
    const { owner, repo } = params;
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  /** 3. List pull requests for a repository */
  async listPulls(params: { owner: string; repo: string; state?: string; page?: number; perPage?: number }): Promise<unknown> {
    const { owner, repo, state = 'open', page = 1, perPage = 30 } = params;
    const query = new URLSearchParams({
      state,
      page: String(page),
      per_page: String(Math.min(perPage, 100)),
      sort: 'updated',
      direction: 'desc',
    });
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${query}`);
  }

  /** 4. Get the diff of a pull request as plain text */
  async getPullDiff(params: { owner: string; repo: string; pullNumber: number }): Promise<string> {
    const { owner, repo, pullNumber } = params;
    return this.request(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`,
      { accept: 'application/vnd.github.v3.diff' },
    ) as Promise<string>;
  }

  /** 5. List issues for a repository (excludes pull requests) */
  async listIssues(params: { owner: string; repo: string; state?: string; page?: number; perPage?: number }): Promise<unknown> {
    const { owner, repo, state = 'open', page = 1, perPage = 30 } = params;
    const query = new URLSearchParams({
      state,
      page: String(page),
      per_page: String(Math.min(perPage, 100)),
      sort: 'updated',
      direction: 'desc',
    });
    const issues = await this.request(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query}`,
    );
    if (Array.isArray(issues)) {
      return issues.filter((issue: any) => !issue.pull_request);
    }
    return issues;
  }

  /** 6. List GitHub Actions workflow runs */
  async listRuns(params: { owner: string; repo: string; branch?: string; page?: number; perPage?: number }): Promise<unknown> {
    const { owner, repo, branch, page = 1, perPage = 30 } = params;
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(Math.min(perPage, 100)),
    });
    if (branch) query.set('branch', branch);
    return this.request(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${query}`,
    );
  }

  /** 7. Get a single commit by SHA */
  async getCommit(params: { owner: string; repo: string; sha: string }): Promise<unknown> {
    const { owner, repo, sha } = params;
    return this.request(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
    );
  }

  /** 8. Get the current rate limit status */
  async getRateLimit(): Promise<unknown> {
    return this.request('GET', '/rate_limit');
  }

  /** 9. Search code across repositories */
  async searchCode(params: { query: string; org?: string; page?: number; perPage?: number }): Promise<unknown> {
    const { query: searchQuery, org, page = 1, perPage = 30 } = params;
    let q = searchQuery;
    if (org) q += ` org:${org}`;
    const query = new URLSearchParams({
      q,
      page: String(page),
      per_page: String(Math.min(perPage, 100)),
    });
    return this.request('GET', `/search/code?${query}`);
  }

  /** Get the last known rate limit info from response headers */
  getLastRateLimit(): GitHubRateLimitInfo | null {
    return this.lastRateLimit;
  }

  // --- Internal HTTP client ---

  private async request(method: string, path: string, options?: { accept?: string }): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: options?.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'EnvHub-MCP-GitHub/1.0',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { method, headers, signal: controller.signal });
      this.updateRateLimit(res.headers);

      if (res.status === 403 && this.lastRateLimit && this.lastRateLimit.remaining === 0) {
        const resetAt = new Date(this.lastRateLimit.reset * 1000).toISOString();
        throw new Error(`GitHub API rate limit exceeded. Resets at ${resetAt}`);
      }
      if (res.status === 404) {
        throw new Error(`GitHub resource not found: ${method} ${path}`);
      }
      if (!res.ok) {
        let errorBody: string;
        try {
          const json = await res.json() as { message?: string };
          errorBody = json.message || JSON.stringify(json);
        } catch {
          errorBody = await res.text();
        }
        throw new Error(`GitHub API error (${res.status}): ${errorBody}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') || !options?.accept) {
        return await res.json();
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private updateRateLimit(headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');
    const used = headers.get('x-ratelimit-used');

    if (remaining !== null && limit !== null) {
      this.lastRateLimit = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: reset ? parseInt(reset, 10) : 0,
        used: used ? parseInt(used, 10) : 0,
      };
      if (this.lastRateLimit.remaining <= RATE_LIMIT_THRESHOLD && this.lastRateLimit.remaining > 0) {
        console.error(`[GitHubClient] Rate limit low: ${this.lastRateLimit.remaining}/${this.lastRateLimit.limit}`);
      }
    }
  }
}
