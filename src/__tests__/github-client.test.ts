import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubClient } from '../github-client.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GitHubClient', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient('test-token', 'https://api.github.com');
    vi.clearAllMocks();
  });

  function mockResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
    const headerMap = new Map(Object.entries({
      'content-type': 'application/json',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-reset': '1700000000',
      'x-ratelimit-used': '1',
      ...headers,
    }));
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headerMap.get(k) || null },
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
  }

  describe('listRepos', () => {
    it('should list user repos when no org provided', async () => {
      const repos = [{ id: 1, name: 'repo1' }];
      mockResponse(repos);

      const result = await client.listRepos({});

      expect(mockFetch).toHaveBeenCalledOnce();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/user/repos');
      expect(url).toContain('sort=updated');
      expect(result).toEqual(repos);
    });

    it('should list org repos when org provided', async () => {
      mockResponse([]);
      await client.listRepos({ org: 'my-org' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/orgs/my-org/repos');
    });

    it('should respect pagination params', async () => {
      mockResponse([]);
      await client.listRepos({ page: 2, perPage: 50 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=2');
      expect(url).toContain('per_page=50');
    });

    it('should cap perPage at 100', async () => {
      mockResponse([]);
      await client.listRepos({ perPage: 200 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('per_page=100');
    });
  });

  describe('getRepo', () => {
    it('should fetch repo by owner/name', async () => {
      const repo = { id: 1, full_name: 'owner/repo' };
      mockResponse(repo);
      const result = await client.getRepo({ owner: 'owner', repo: 'repo' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/repos/owner/repo');
      expect(result).toEqual(repo);
    });
  });

  describe('listPulls', () => {
    it('should list PRs with default state open', async () => {
      mockResponse([]);
      await client.listPulls({ owner: 'o', repo: 'r' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/repos/o/r/pulls');
      expect(url).toContain('state=open');
    });
  });

  describe('getPullDiff', () => {
    it('should request diff with correct accept header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'diff --git a/file',
      });
      const result = await client.getPullDiff({ owner: 'o', repo: 'r', pullNumber: 1 });
      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>).Accept).toBe('application/vnd.github.v3.diff');
      expect(result).toBe('diff --git a/file');
    });
  });

  describe('listIssues', () => {
    it('should filter out pull requests from issues', async () => {
      const issues = [
        { id: 1, title: 'Bug' },
        { id: 2, title: 'PR', pull_request: { url: 'http://...' } },
      ];
      mockResponse(issues);
      const result = await client.listIssues({ owner: 'o', repo: 'r' });
      expect(result).toEqual([{ id: 1, title: 'Bug' }]);
    });
  });

  describe('listRuns', () => {
    it('should list runs and support branch filter', async () => {
      mockResponse({ workflow_runs: [] });
      await client.listRuns({ owner: 'o', repo: 'r', branch: 'main' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/actions/runs');
      expect(url).toContain('branch=main');
    });
  });

  describe('getCommit', () => {
    it('should fetch commit by SHA', async () => {
      const commit = { sha: 'abc123' };
      mockResponse(commit);
      const result = await client.getCommit({ owner: 'o', repo: 'r', sha: 'abc123' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/commits/abc123');
      expect(result).toEqual(commit);
    });
  });

  describe('getRateLimit', () => {
    it('should fetch rate limit', async () => {
      const rateLimit = { rate: { remaining: 4999 } };
      mockResponse(rateLimit);
      const result = await client.getRateLimit();
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/rate_limit');
      expect(result).toEqual(rateLimit);
    });
  });

  describe('searchCode', () => {
    it('should search with org scope', async () => {
      mockResponse({ items: [] });
      await client.searchCode({ query: 'test', org: 'my-org' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/search/code');
      expect(url).toContain('org%3Amy-org');
    });
  });

  describe('error handling', () => {
    it('should throw on 404', async () => {
      mockResponse({ message: 'Not Found' }, 404);
      await expect(client.getRepo({ owner: 'x', repo: 'y' })).rejects.toThrow('not found');
    });

    it('should throw on rate limit exceeded', async () => {
      const headerMap = new Map([
        ['content-type', 'application/json'],
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-limit', '5000'],
        ['x-ratelimit-reset', '1700000000'],
        ['x-ratelimit-used', '5000'],
      ]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: (k: string) => headerMap.get(k) || null },
        json: async () => ({ message: 'rate limit exceeded' }),
        text: async () => '{"message":"rate limit exceeded"}',
      });
      await expect(client.getRateLimit()).rejects.toThrow('rate limit');
    });
  });

  describe('rate limit tracking', () => {
    it('should track rate limit from response headers', async () => {
      expect(client.getLastRateLimit()).toBeNull();
      mockResponse({ id: 1 });
      await client.getRepo({ owner: 'o', repo: 'r' });
      const rl = client.getLastRateLimit();
      expect(rl).not.toBeNull();
      expect(rl!.remaining).toBe(4999);
      expect(rl!.limit).toBe(5000);
    });
  });

  describe('auth headers', () => {
    it('should send Bearer token and API version', async () => {
      mockResponse({});
      await client.getRateLimit();
      const opts = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-token');
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });
  });
});
