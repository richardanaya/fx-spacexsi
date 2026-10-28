# fx-spacexsi

MCP server and fx skills for Grok Imagine, speech, and search.

## Layout

- `src/xai-api.ts` builds request bodies. It does no I/O. Keep it that way so tests can check the wire without a server.
- `src/client.ts` calls `https://api.x.ai/v1` and writes media to `outputPath`.
- `src/server.ts` registers the MCP tools. `src/index.ts` speaks stdio and reads `XAI_API_KEY`.
- `skills/` is discovered by fx from a checkout. Each directory has one `SKILL.md`.
- `examples/mcp.json` is a project `.mcp.json` snippet. `examples/search.ts` calls the client directly.

## Commands

Node.js 22 or newer.

```bash
npm test
npm run typecheck
npm run build
```

`npm test` runs `node --experimental-strip-types` against `tests/**/*.test.ts`. Tests inject `fetch`. Do not call the live xAI API from tests.

## Auth

The server exits if `XAI_API_KEY` is missing. Optional `XAI_MODEL` overrides the search model (default `grok-4.7`).

## Publishing

`publishConfig.access` is `public`. Do not run `npm publish` unless someone asks for a release.
