---
name: grok-imagine
description: Generate or edit images and videos with Grok Imagine through the fx-spacexsi MCP server. Use when the user wants a picture, an edit of a picture, or a video from text, a still, or reference images.
---

# Grok Imagine

Use the `spacexsi` MCP server. Do not invent a different image API.

## Images

- `image_gen` creates images. `image_edit` edits one image or up to five (`images`). Provide exactly one of `image` or `images`.
- Models: `grok-imagine-image`, `grok-imagine-image-quality`, or `grok-imagine-image-2.0`. `grok-imagine-image-pro` is an alias of `grok-imagine-image-quality` and is sent unchanged.
- `quality` (`low`, `medium`, or `auto`) is only valid on `grok-imagine-image-2.0`. Omit it for the other models.
- `n` is 1–10. `resolution` is `1k`, `1.5k`, or `2k`. Aspect ratios include `21:9` and `5:2`.
- `outputPath` is required. The tool writes the file and returns that path. When `n` is greater than 1 the files are numbered.
- Inputs may be an `https` URL, a `data:` URI, a `file_` id, or a local path.
- `deferred` polls `GET /v1/images/{request_id}` and only works with URL responses, not `b64_json`.

## Video

- `text_to_video`, `image_to_video`, and `reference_to_video` start a job and poll until the mp4 is saved to `outputPath`.
- Prefer `grok-imagine-video-1.5` for native 1080p, a pinned `last_frame`, preset `reference_audios`, and up to four interior `keyframes`. `grok-imagine-video-1.5-lite` reaches 1080p by upscaling 720p and does not take references or pinned frames. `grok-imagine-video` stops at 720p.
- Reference-to-video stays 720p. Up to 14 reference images on 1.5 (7 on `grok-imagine-video`) and 3 voices. Tag them `<IMAGE_0>` and `<AUDIO_0>` in the prompt. If `image` pins frame 1, references start at `<IMAGE_1>`.
- `video_edit` and `video_extend` require `grok-imagine-video`, not 1.5. Extend adds 2–10 seconds.
- Duration for a new clip is 1–15 seconds. Set `generate_audio` to false for a silent clip. Audio is on when the field is omitted.
- Each `reference_audios` entry is a `voice_id` or an `audio` clip, not both.

Read the saved path back to the user. Do not claim an image exists until the tool returns the path.
