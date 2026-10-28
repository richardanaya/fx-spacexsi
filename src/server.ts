import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	IMAGE_MODEL_2,
	IMAGE_MODEL_QUALITY,
	MAX_REFERENCE_IMAGES,
	STT_MODEL,
	VIDEO_ASPECT_RATIOS,
} from "./xai-api.ts";
import type { XaiClient } from "./client.ts";

export const TOOL_NAMES = [
	"web_search",
	"x_search",
	"image_gen",
	"image_edit",
	"text_to_video",
	"image_to_video",
	"reference_to_video",
	"video_edit",
	"video_extend",
	"text_to_speech",
	"speech_to_text",
	"list_speech_voices",
] as const;

const aspectImage = z.enum([
	"1:1",
	"16:9",
	"9:16",
	"4:3",
	"3:4",
	"3:2",
	"2:3",
	"2:1",
	"1:2",
	"19.5:9",
	"9:19.5",
	"20:9",
	"9:20",
	"21:9",
	"5:2",
	"auto",
]);
const aspectVideo = z.enum(VIDEO_ASPECT_RATIOS);
const videoResolution = z.enum(["480p", "720p", "1080p"]);
const storageOptions = z
	.object({
		filename: z.string().describe("Required when storage_options is present"),
		expires_after: z
			.number()
			.int()
			.max(2592000)
			.optional()
			.describe("Seconds until the stored file expires (max 30 days). Omit to keep the file."),
		public_url: z
			.union([
				z.boolean(),
				z.object({
					expires_after: z.number().int().max(2592000).optional(),
				}),
			])
			.optional(),
	})
	.optional()
	.describe("Optional storage configuration for generated files");

const imageFields = {
	model: z
		.string()
		.describe(
			`grok-imagine-image, ${IMAGE_MODEL_QUALITY}, or ${IMAGE_MODEL_2}. grok-imagine-image-pro is an alias of ${IMAGE_MODEL_QUALITY} and is sent unchanged. quality is ${IMAGE_MODEL_2} only.`,
		),
	prompt: z.string(),
	aspect_ratio: aspectImage.optional(),
	resolution: z.enum(["1k", "1.5k", "2k"]).optional(),
	quality: z
		.enum(["low", "medium", "auto"])
		.optional()
		.describe(
			"grok-imagine-image-2.0 only. Omit or auto: low for generation, medium for edits. Pin low or medium to force a tier.",
		),
	response_format: z.enum(["url", "b64_json"]).optional(),
	storage_options: storageOptions,
	deferred: z
		.boolean()
		.optional()
		.describe(
			"Return immediately and poll GET /v1/images/{request_id}. Only response_format url (the default) is supported.",
		),
	outputPath: z.string().describe("Required destination filename; numbered when n > 1"),
};

const videoModel = z
	.string()
	.describe(
		"grok-imagine-video, grok-imagine-video-1.5, or grok-imagine-video-1.5-lite. Native 1080p, voices, last_frame, and keyframes need 1.5. 1.5-lite reaches 1080p by upscaling 720p for text-to-video and image-to-video. Reference-to-video stays 720p. Video edit and extend require grok-imagine-video.",
	);

function text(result: { text: string }) {
	return { content: [{ type: "text" as const, text: result.text }] };
}

export function createServer(client: XaiClient): McpServer {
	const server = new McpServer({ name: "fx-spacexsi", version: "0.1.0" });

	server.registerTool(
		"web_search",
		{
			title: "Web Search",
			description:
				"Search the public web for up-to-date information. Use for news, docs, or facts not in the repo. For X/Twitter posts use x_search.",
			inputSchema: {
				query: z.string().describe("The search query to perform."),
				allowed_domains: z
					.array(z.string())
					.max(5)
					.optional()
					.describe("Only search these domains. Cannot be combined with excluded_domains."),
				excluded_domains: z
					.array(z.string())
					.max(5)
					.optional()
					.describe("Skip these domains. Cannot be combined with allowed_domains."),
				enable_image_understanding: z
					.boolean()
					.optional()
					.describe("Let the search inspect images on pages it browses."),
				enable_image_search: z
					.boolean()
					.optional()
					.describe("Include image results. The answer may contain Markdown image embeds."),
				max_turns: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Cap how many agentic tool-calling turns this search may take."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async (args) => text(await client.webSearch(args)),
	);

	server.registerTool(
		"x_search",
		{
			title: "X Search",
			description:
				"Search X (Twitter) posts, users, and threads with the xAI x_search tool. Use for live posts, accounts, or conversations on X.",
			inputSchema: {
				query: z.string().describe("What to search for on X (keywords, topic, or @handle)."),
				from_date: z
					.string()
					.optional()
					.describe(
						"Inclusive start date (YYYY-MM-DD), from 00:00 UTC. Other formats are ignored by the API.",
					),
				to_date: z
					.string()
					.optional()
					.describe(
						"Exclusive end date (YYYY-MM-DD). Posts are included up to but not including this date. For one day, set to_date to the next day.",
					),
				allowed_x_handles: z
					.array(z.string())
					.max(20)
					.optional()
					.describe(
						"Only posts from these handles, without @. Cannot be combined with excluded_x_handles.",
					),
				excluded_x_handles: z
					.array(z.string())
					.max(20)
					.optional()
					.describe(
						"Skip posts from these handles, without @. Cannot be combined with allowed_x_handles.",
					),
				enable_image_understanding: z
					.boolean()
					.optional()
					.describe("Let the model look at images in the posts it finds."),
				enable_video_understanding: z
					.boolean()
					.optional()
					.describe("Let the model watch videos in the posts it finds. X Search only."),
				max_turns: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Cap how many agentic tool-calling turns this search may take."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async (args) => text(await client.xSearch(args)),
	);

	server.registerTool(
		"image_gen",
		{
			title: "Grok Imagine Image Generation",
			description: "Grok Imagine: generate images with all REST options.",
			inputSchema: {
				...imageFields,
				n: z.number().int().min(1).max(10).optional(),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.imageGen(args)),
	);

	server.registerTool(
		"image_edit",
		{
			title: "Grok Imagine Image Edit",
			description:
				"Grok Imagine: edit one or up to five images (grok-imagine-image-2.0 supports up to 5; older models may reject >3). Inputs may be URLs, file IDs, data URIs, or local paths.",
			inputSchema: {
				...imageFields,
				image: z.string().optional(),
				images: z.array(z.string()).min(1).max(5).optional(),
				n: z.number().int().min(1).max(10).optional(),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.imageEdit(args)),
	);

	server.registerTool(
		"text_to_video",
		{
			title: "Grok Imagine Text-to-Video",
			description:
				"Grok Imagine: generate a video from a text prompt. Duration 1–15s (default 8). grok-imagine-video-1.5 renders 1080p natively. grok-imagine-video-1.5-lite reaches 1080p by upscaling 720p. grok-imagine-video stops at 720p. Audio is on unless generate_audio is false.",
			inputSchema: {
				model: videoModel,
				prompt: z.string(),
				duration: z.number().min(1).max(15).optional(),
				aspect_ratio: aspectVideo.optional(),
				resolution: videoResolution.optional(),
				generate_audio: z
					.boolean()
					.optional()
					.describe("Include a generated audio track. Defaults to true. Set false for a silent video."),
				storage_options: storageOptions,
				outputPath: z.string().describe("Required destination video filename"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.textToVideo(args)),
	);

	server.registerTool(
		"image_to_video",
		{
			title: "Grok Imagine Image-to-Video",
			description:
				"Grok Imagine: animate a source image. The image is frame 1 and aspect_ratio is ignored (the clip matches the still). On grok-imagine-video-1.5, last_frame pins the closing frame and the request becomes reference-to-video. 1080p is native on 1.5 and upscaled from 720p on 1.5-lite.",
			inputSchema: {
				model: videoModel,
				image: z.string().describe("Source image (URL, data URI, file ID, or local path)"),
				last_frame: z
					.string()
					.optional()
					.describe("grok-imagine-video-1.5: image the clip must end on. Same input kinds as image."),
				prompt: z.string().optional().describe("Optional motion and camera guidance"),
				duration: z.number().min(1).max(15).optional(),
				aspect_ratio: aspectVideo.optional(),
				resolution: videoResolution.optional(),
				generate_audio: z.boolean().optional(),
				storage_options: storageOptions,
				outputPath: z.string().describe("Required destination video filename"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.imageToVideo(args)),
	);

	server.registerTool(
		"reference_to_video",
		{
			title: "Grok Imagine Reference-to-Video",
			description:
				"Grok Imagine: video from reference images and/or preset voices. On grok-imagine-video-1.5, image pins frame 1, last_frame pins the end, and keyframes (max 4) pin interior frames. Tag images <IMAGE_0>… and voices <AUDIO_0>… in the prompt. If image is set, references start at <IMAGE_1>. Up to 14 images on 1.5 (7 on grok-imagine-video), 3 voices, 720p. grok-imagine-video reference clips are capped at 10 seconds. 1.5-lite does not support this mode. Prompt is optional when a frame is pinned.",
			inputSchema: {
				model: videoModel,
				prompt: z.string().optional(),
				image: z.string().optional().describe("grok-imagine-video-1.5: pin this image as frame 1"),
				last_frame: z
					.string()
					.optional()
					.describe("grok-imagine-video-1.5: pin this image as the last frame"),
				reference_images: z.array(z.string()).max(MAX_REFERENCE_IMAGES).optional(),
				reference_audios: z
					.array(
						z.object({
							voice_id: z
								.string()
								.optional()
								.describe("Preset voice id, same roster as TTS (eve, leo, ara, rex, sal)"),
							audio: z
								.string()
								.optional()
								.describe(
									"Partner-only custom clip: URL, data URI, or local path. Mutually exclusive with voice_id.",
								),
						}),
					)
					.max(3)
					.optional(),
				keyframes: z
					.array(
						z.object({
							image: z.string().describe("URL, data URI, file ID, or local path"),
							timestamp_s: z
								.number()
								.min(0)
								.describe(
									"Seconds strictly inside the clip (greater than 0 and less than duration). Anchors snap to a 1/3s grid.",
								),
						}),
					)
					.max(4)
					.optional(),
				duration: z.number().min(1).max(15).optional(),
				aspect_ratio: aspectVideo.optional(),
				resolution: videoResolution.optional(),
				generate_audio: z.boolean().optional(),
				storage_options: storageOptions,
				outputPath: z.string().describe("Required destination video filename"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.referenceToVideo(args)),
	);

	server.registerTool(
		"video_edit",
		{
			title: "Grok Imagine Video Edit",
			description:
				"Grok Imagine: edit a video with a text prompt using grok-imagine-video. 1.5 and 1.5-lite do not edit. Input must be an mp4 (URL, data URI, file ID, or local path). Duration and resolution follow the source, capped at 8.7 seconds and 720p.",
			inputSchema: {
				model: videoModel,
				prompt: z.string(),
				video: z.string(),
				storage_options: storageOptions,
				outputPath: z.string().describe("Required destination video filename"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.videoEdit(args)),
	);

	server.registerTool(
		"video_extend",
		{
			title: "Grok Imagine Video Extension",
			description:
				"Grok Imagine: continue a video from its last frame using grok-imagine-video. 1.5 and 1.5-lite do not extend. The new segment is 2–10 seconds (default 6). Input must be an mp4 between 2 and 15 seconds.",
			inputSchema: {
				model: videoModel,
				prompt: z.string(),
				video: z.string(),
				duration: z.number().min(2).max(10).optional(),
				storage_options: storageOptions,
				outputPath: z.string().describe("Required destination video filename"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.videoExtend(args)),
	);

	server.registerTool(
		"text_to_speech",
		{
			title: "Text to Speech",
			description:
				"Synthesize speech with every REST option and save it to the required outputPath. This tool does not play audio. POST /v1/tts has no model field.",
			inputSchema: {
				text: z.string().max(60000),
				language: z.string().describe("BCP-47 code or auto"),
				voice_id: z.string().optional(),
				speed: z.number().min(0.7).max(1.5).optional(),
				codec: z.enum(["mp3", "wav", "pcm", "mulaw", "alaw"]).optional(),
				sample_rate: z.union([
					z.literal(8000),
					z.literal(16000),
					z.literal(22050),
					z.literal(24000),
					z.literal(44100),
					z.literal(48000),
				]).optional(),
				bit_rate: z.union([
					z.literal(32000),
					z.literal(64000),
					z.literal(96000),
					z.literal(128000),
					z.literal(192000),
				]).optional(),
				optimize_streaming_latency: z.enum(["0", "1", "2"]).optional(),
				text_normalization: z.boolean().optional(),
				with_timestamps: z.boolean().optional(),
				replace: z
					.record(z.string(), z.string())
					.optional()
					.describe(
						"Pronunciation map applied before synthesis. Keys are whole words. Values may be respellings or /IPA/. Up to 200 entries.",
					),
				outputPath: z.string().describe("Required audio destination path, including filename"),
				timestampsPath: z.string().optional().describe("Save the timestamp JSON envelope here"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.textToSpeech(args)),
	);

	server.registerTool(
		"speech_to_text",
		{
			title: "Speech to Text",
			description: `Transcribe a local audio file or URL. Defaults to ${STT_MODEL}. grok-voice-transcribe-1.0 is rewritten to that model.`,
			inputSchema: {
				file: z.string().optional(),
				url: z.string().optional(),
				audio_format: z.enum(["pcm", "mulaw", "alaw"]).optional(),
				sample_rate: z.number().int().optional(),
				language: z.string().optional(),
				format: z.boolean().optional(),
				multichannel: z.boolean().optional(),
				channels: z.number().int().min(2).max(8).optional(),
				diarize: z.boolean().optional(),
				keyterm: z.array(z.string().max(50)).max(100).optional(),
				filler_words: z.boolean().optional(),
				model: z.string().optional().describe(`Speech-to-text model. Defaults to ${STT_MODEL}.`),
				vad_threshold: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe(
						"Voice-activity gate from 0 to 1. Lower keeps quieter speech. 0 disables the gate. The API default is 0.08.",
					),
				outputPath: z.string().optional().describe("Save full transcript JSON"),
			},
			annotations: { openWorldHint: true },
		},
		async (args) => text(await client.speechToText(args)),
	);

	server.registerTool(
		"list_speech_voices",
		{
			title: "List Speech Voices",
			description: "List built-in TTS voices and this team's custom voices.",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async () => text(await client.listSpeechVoices()),
	);

	return server;
}
