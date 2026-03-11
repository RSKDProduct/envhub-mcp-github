#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GitHubClient } from './github-client.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BASE_URL = process.env.GITHUB_BASE_URL;

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

const client = new GitHubClient(GITHUB_TOKEN, GITHUB_BASE_URL);

const server = new McpServer({
  name: 'envhub-mcp-github',
  version: '1.0.0',
});

// 1. List repos
server.tool(
  'github_list_repos',
  'List repositories for the authenticated user or a specific organization',
  {
    org: z.string().optional().describe('Organization name (optional, defaults to user repos)'),
    page: z.number().optional().describe('Page number (default: 1)'),
    perPage: z.number().optional().describe('Results per page (default: 30, max: 100)'),
  },
  async ({ org, page, perPage }) => {
    const result = await client.listRepos({ org, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 2. Get repo
server.tool(
  'github_get_repo',
  'Get detailed information about a specific repository',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
  },
  async ({ owner, repo }) => {
    const result = await client.getRepo({ owner, repo });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 3. List pulls
server.tool(
  'github_list_pulls',
  'List pull requests for a repository',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ owner, repo, state, page, perPage }) => {
    const result = await client.listPulls({ owner, repo, state, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 4. Get pull diff
server.tool(
  'github_get_pull_diff',
  'Get the diff of a pull request as plain text',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    pullNumber: z.number().describe('Pull request number'),
  },
  async ({ owner, repo, pullNumber }) => {
    const result = await client.getPullDiff({ owner, repo, pullNumber });
    return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  }
);

// 5. List issues
server.tool(
  'github_list_issues',
  'List issues for a repository (excludes pull requests)',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ owner, repo, state, page, perPage }) => {
    const result = await client.listIssues({ owner, repo, state, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 6. List workflow runs
server.tool(
  'github_list_runs',
  'List GitHub Actions workflow runs for a repository',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    branch: z.string().optional().describe('Filter by branch name'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ owner, repo, branch, page, perPage }) => {
    const result = await client.listRuns({ owner, repo, branch, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 7. Get commit
server.tool(
  'github_get_commit',
  'Get detailed information about a specific commit',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    sha: z.string().describe('Commit SHA'),
  },
  async ({ owner, repo, sha }) => {
    const result = await client.getCommit({ owner, repo, sha });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 8. Get rate limit
server.tool(
  'github_get_rate_limit',
  'Check the current GitHub API rate limit status for the authenticated token',
  {},
  async () => {
    const result = await client.getRateLimit();
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// 9. Search code
server.tool(
  'github_search_code',
  'Search code across GitHub repositories',
  {
    query: z.string().describe('Search query string'),
    org: z.string().optional().describe('Scope search to an organization'),
    page: z.number().optional().describe('Page number'),
    perPage: z.number().optional().describe('Results per page'),
  },
  async ({ query, org, page, perPage }) => {
    const result = await client.searchCode({ query, org, page, perPage });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
