# Woodex CMS MCP server

Gives MCP clients (**Claude**, **Codex**, **Cursor**) direct access to the Woodex
Interior website: pages, blog posts, projects, site settings and the media
library. Publishing tools commit straight to `main`, which redeploys the live
site on Vercel.

## Setup

```bash
cd mcp-server
npm install
cp .env.example .env
```

Fill in `.env` (never commit it):

| Variable | Where to get it |
|---|---|
| `WOODEX_GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens → fine-grained PAT with **Contents: read & write** on `marketingwoodex-cloud/-marketingwoodex` |
| `WOODEX_SUPABASE_URL` | Supabase project → Settings → API |
| `WOODEX_SUPABASE_KEY` | Supabase project → Settings → API → `service_role` key (keep secret) |

Optional: `WOODEX_REPO`, `WOODEX_BRANCH` (defaults suit the live site).

Test it:

```bash
node server.mjs
```

It speaks MCP over stdio — no output means it is waiting for a client.

## Connect a client

### Claude Desktop

Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "woodex-cms": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/server.mjs"],
      "env": {
        "WOODEX_GITHUB_TOKEN": "…",
        "WOODEX_SUPABASE_URL": "https://….supabase.co",
        "WOODEX_SUPABASE_KEY": "…"
      }
    }
  }
}
```

### Cursor

Settings → MCP → Add new MCP server → stdio:

- Command: `node /absolute/path/to/mcp-server/server.mjs`
- Environment variables: the three above.

### Codex

In `~/.codex/config.toml`:

```toml
[mcp_servers.woodex-cms]
command = "node"
args = ["/absolute/path/to/mcp-server/server.mjs"]
env = { WOODEX_GITHUB_TOKEN = "…", WOODEX_SUPABASE_URL = "https://….supabase.co", WOODEX_SUPABASE_KEY = "…" }
```

## Tools (17)

**Pages** — `list_pages`, `get_page`, `update_page`
**Blog** — `list_blog_posts`, `get_blog_post`, `create_blog_post`, `update_blog_post`,
`publish_blog_post`, `unpublish_blog_post`, `delete_blog_post`
**Projects** — `list_projects`, `get_project`, `publish_project`, `unpublish_project`
**Settings** — `get_settings`, `update_setting`
**Media** — `list_media`

## Safety rules

- `update_page` only writes public `.html` pages — never `admin/`, `netlify/`, `api/` or config files.
- Publishing writes to `main` and redeploys the live site within about a minute.
- `delete_blog_post` refuses published posts; unpublish first.
- Keep the header, navigation, footer, navy `#0a0f1e` theme and button styles intact on every page edit. Copy stays short and human — no invented clients, projects, rates or people.
