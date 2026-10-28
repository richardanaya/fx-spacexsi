---
name: grok-search
description: Search the public web or X with xAI hosted tools through the fx-spacexsi MCP server. Use for current facts, docs, news, or posts that are not in the repo.
---

# Grok search

Use the `spacexsi` MCP server. These tools call `POST /v1/responses` with a hosted agent tool. They are not Chat Completions tools.

## Which tool

- `web_search` is the public web. Use it for news, docs, and facts that are not in the workspace.
- `x_search` is X (Twitter) only. Use it for posts, accounts, and threads. Do not use `web_search` for X.

## Web

- `allowed_domains` and `excluded_domains` cannot both be set. Each list is capped at 5.
- `enable_image_understanding` lets the search inspect images on pages. `enable_image_search` may add Markdown image embeds to the answer.
- `max_turns` caps how many agentic tool turns the search may take.

## X

- `from_date` is inclusive from 00:00 UTC (`YYYY-MM-DD`). `to_date` is exclusive: posts are included up to but not including that date. For a single day, set `to_date` to the next day.
- `allowed_x_handles` and `excluded_x_handles` cannot both be set. Caps are 20 handles. `@` is stripped.
- `enable_video_understanding` is X Search only.

The tool text includes the answer and any URL citations. Quote the citations when you rely on them. The default model is `grok-4.7` with low reasoning effort unless `XAI_MODEL` is set on the server.
