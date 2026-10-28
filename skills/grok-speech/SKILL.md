---
name: grok-speech
description: Synthesize speech, transcribe audio, or list Grok voices through the fx-spacexsi MCP server. Use when the user wants narration, a voice file, or a transcript.
---

# Grok speech

Use the `spacexsi` MCP server.

## Text to speech

- Call `text_to_speech`. It writes audio to the required `outputPath` and does not play it.
- `POST /v1/tts` has no model field. Do not send `grok-voice-3.0` as a TTS model.
- `language` is a BCP-47 tag or `auto`. `voice_id` is optional; list choices with `list_speech_voices` before guessing a custom voice. Built-in ids include `eve`, `leo`, `ara`, `rex`, and `sal`.
- `speed` is 0.7–1.5. Codecs are `mp3`, `wav`, `pcm`, `mulaw`, and `alaw`.
- Text is at most 60,000 characters. `replace` is a pronunciation map of whole words to respellings or `/IPA/`.
- Set `with_timestamps` and `timestampsPath` when the user needs word timing. Otherwise leave them unset.

## Speech to text

- Call `speech_to_text` with exactly one of `file` (local path) or `url`.
- The default model is `grok-voice-transcribe-2.0`. `grok-voice-transcribe-1.0` is rewritten to 2.0. `grok-voice-3.0` is speech-to-speech and is not an STT model.
- Optional flags match the REST API: `language`, `diarize`, `keyterm` (up to 100 terms, 50 characters each), `filler_words`, and `vad_threshold` from 0 to 1.
- Pass `outputPath` to keep the full JSON. The tool text is the transcript.

## Voices

- `list_speech_voices` returns built-in voices from `GET /v1/tts/voices` and this team's custom voices from `GET /v1/custom-voices`.
