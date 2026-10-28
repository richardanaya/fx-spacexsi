# fx-spacexsi

MCP server and [fx](https://fx.sh) skills for Grok Imagine, speech, and search. The server speaks stdio and calls the xAI REST API with `XAI_API_KEY`.

Imagine covers image generation and editing, text-to-video, image-to-video, reference-to-video, video edit, and video extend. Speech covers text-to-speech, speech-to-text, and the voice catalog. Search covers public web search and X search through `POST /v1/responses`.

Request builders match [pi-spacexai](https://github.com/richardanaya/pi-spacexai). This package does not load a pi extension. fx starts the binary as an MCP server and reads the skills in `skills/`.

## Install for fx

From a published package:

```bash
fx mcp add spacexsi -- npx -y fx-spacexsi
```

fx only forwards `HOME`, `PATH`, and a few other variables into a stdio server. Put the key on the server entry. `examples/mcp.json` is a project `.mcp.json` you can copy:

```json
{
  "mcpServers": {
    "spacexsi": {
      "type": "stdio",
      "command": ["npx", "-y", "fx-spacexsi"],
      "env": {
        "XAI_API_KEY": "${XAI_API_KEY}"
      }
    }
  }
}
```

Approve it with `fx mcp approve spacexsi`, then `fx mcp show spacexsi`.

From a checkout:

```bash
npm install
fx mcp add spacexsi -- node ./dist/index.js
```

`npm install` builds `dist/`. Optional `XAI_MODEL` selects the search model. The default is `grok-4.7`.

## Skills

fx discovers `skills/` in a checkout. From GitHub:

```bash
fx skills install richardanaya/fx-spacexsi --skill grok-imagine
fx skills install richardanaya/fx-spacexsi --skill grok-speech
fx skills install richardanaya/fx-spacexsi --skill grok-search
```

| Skill | Tools |
| --- | --- |
| `grok-imagine` | `image_gen`, `image_edit`, `text_to_video`, `image_to_video`, `reference_to_video`, `video_edit`, `video_extend` |
| `grok-speech` | `text_to_speech`, `speech_to_text`, `list_speech_voices` |
| `grok-search` | `web_search`, `x_search` |

`quality` is only valid on `grok-imagine-image-2.0`. Web and X domain or handle filters cannot be combined with their exclude lists. Text-to-speech has no model field. Speech-to-text defaults to `grok-voice-transcribe-2.0`.

## Develop

```bash
npm test
npm run typecheck
```

`examples/search.ts` runs one web search outside MCP:

```bash
XAI_API_KEY=... node --experimental-strip-types examples/search.ts "latest Starship flight"
```

## License

MIT. Copyright (c) 2026 Richard Anaya.
