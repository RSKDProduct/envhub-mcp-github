# EnvHub MCP GitHub Server

A Model Context Protocol (MCP) server that provides GitHub API tools for AI assistants like Claude.

## Tools (9)

| Tool | Description |
|------|-------------|
| `github_list_repos` | List repositories for user or organization |
| `github_get_repo` | Get repository details |
| `github_list_pulls` | List pull requests |
| `github_get_pull_diff` | Get PR diff as text |
| `github_list_issues` | List issues (excludes PRs) |
| `github_list_runs` | List GitHub Actions workflow runs |
| `github_get_commit` | Get commit details |
| `github_get_rate_limit` | Check API rate limit |
| `github_search_code` | Search code across repos |

## Configuration

Set environment variables:

```bash
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_BASE_URL=https://api.github.com  # optional, for GitHub Enterprise
```

## Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/path/to/envhub-mcp-github/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

## Development

```bash
npm install
npm run build
npm run dev  # uses tsx for hot reload
```

## Docker

```bash
docker build -t envhub-mcp-github .
docker run -e GITHUB_TOKEN=ghp_xxx envhub-mcp-github
```
