#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GitHubClient } from './github-client.js';

// Env vars are optional defaults — credentials can be provided per-request
const DEFAULT_GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const DEFAULT_GITHUB_BASE_URL = process.env.GITHUB_BASE_URL;

// Default client (may be null if no env vars set)
const defaultClient = DEFAULT_GITHUB_TOKEN
  ? new GitHubClient(DEFAULT_GITHUB_TOKEN, DEFAULT_GITHUB_BASE_URL)
  : null;

/**
 * Resolve the client to use for a tool call.
 * Per-request token/baseUrl override the env defaults.
 */
function resolveClient(token?: string, baseUrl?: string): GitHubClient {
  if (token) {
    return new GitHubClient(token, baseUrl || DEFAULT_GITHUB_BASE_URL);
  }
  if (!defaultClient) {
    throw new Error('No GitHub token provided. Set GITHUB_TOKEN env var or pass token per request.');
  }
  return defaultClient;
}

// Common credential schema shared by all tools
const credentialSchema = {
  token: z.string().optional().describe('GitHub personal access token (overrides GITHUB_TOKEN env var)'),
  baseUrl: z.string().optional().describe('GitHub API base URL for GHE (overrides GITHUB_BASE_URL env var)'),
};

const server = new McpServer({
  name: 'envhub-mcp-github',
  version: '1.0.0',
});

// 1. List repos
server.tool(
  'github_list_repos',
  'List repositories for the authenticated user or a specific organization',
  {
    ...credentialSchema,
    org: z.string().optional().describe('Organization name (optional, defaults to user repos)'),
    page: z.number().optional().describe('Page number (default: 1)'),
    perPage: z.number().optional().describe('Results per page (default: 30, max: 100)'),
  },
  async ({ token, baseUrl, org, page, perPage }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.listRepos({ org, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 2. Get repo
server.tool(
  'github_get_repo',
  'Get detailed information about a specific repository',
  {
    ...credentialSchema,
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
  },
  async ({ token, baseUrl, owner, repo }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.getRepo({ owner, repo });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 3. List pulls
server.tool(
  'github_list_pulls',
  'List pull requests for a repository',
  {
    ...credentialSchema,
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ token, baseUrl, owner, repo, state, page, perPage }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.listPulls({ owner, repo, state, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 4. Get pull diff
server.tool(
  'github_get_pull_diff',
  'Get the diff of a pull request as plain text',
  {
    ...credentialSchema,
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    pullNumber: z.number().describe('Pull request number'),
  },
  async ({ token, baseUrl, owner, repo, pullNumber }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.getPullDiff({ owner, repo, pullNumber });
    return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  }
);

// 5. List issues
server.tool(
  'github_list_issues',
  'List issues for a repository (excludes pull requests)',
  {
    ...credentialSchema,
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ token, baseUrl, owner, repo, state, page, perPage }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.listIssues({ owner, repo, state, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 6. List workflow runs
server.tool(
  'github_list_runs',
  'List GitHub Actions workflow runs for a repository',
  {
    ...credentialSchema,
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    branch: z.string().optional().describe('Filter by branch name'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ token, baseUrl, owner, repo, branch, page, perPage }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.listRuns({ owner, repo, branch, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 7. Get commit
server.tool(
  'github_get_commit',
  'Get detailed information about a specific commit',
  {
    ...credentialSchema,
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    sha: z.string().describe('Commit SHA'),
  },
  async ({ token, baseUrl, owner, repo, sha }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.getCommit({ owner, repo, sha });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 8. Get rate limit
server.tool(
  'github_get_rate_limit',
  'Check the current GitHub API rate limit status for the authenticated token',
  { ...credentialSchema },
  async ({ token, baseUrl }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.getRateLimit();
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 9. Search code
server.tool(
  'github_search_code',
  'Search code across GitHub repositories',
  {
    ...credentialSchema,
    query: z.string().describe('Search query string'),
    org: z.string().optional().describe('Scope search to an organization'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ token, baseUrl, query, org, page, perPage }) => {
    const c = resolveClient(token, baseUrl);
    const result = await c.searchCode({ query, org, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
