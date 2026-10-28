/**
 * xAI REST client behind the fx-spacexsi MCP tools.
 * Imagine, speech, and search follow the same wire shapes as pi-spacexai.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
	buildAgentSearchBody,
	buildTtsBody,
	buildWebSearchTool,
	buildXSearchTool,
	customVoicePage,
	mergeVoiceCatalog,
	normalizeImageRequest,
	resolveSttModel,
	responsesOutputText,
	responsesSearchModel,
	searchUsage,
} from "./xai-api.ts";

export const API_BASE = "https://api.x.ai/v1";
const SEARCH_TIMEOUT_MS = 90_000;
const MAX_POLLS = 120;

const MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".opus": "audio/opus",
	".flac": "audio/flac",
	".aac": "audio/aac",
	".m4a": "audio/mp4",
	".mkv": "video/x-matroska",
};

export interface StorageOptions {
	filename: string;
	expires_after?: number;
	public_url?: boolean | { expires_after?: number };
}

export interface ImageGenArgs {
	model: string;
	prompt: string;
	aspect_ratio?: string;
	resolution?: string;
	quality?: string;
	response_format?: string;
	storage_options?: StorageOptions;
	deferred?: boolean;
	n?: number;
	outputPath: string;
}

export interface ImageEditArgs extends ImageGenArgs {
	image?: string;
	images?: string[];
}

export interface VideoCommon {
	model: string;
	storage_options?: StorageOptions;
	outputPath: string;
}

export interface TextToVideoArgs extends VideoCommon {
	prompt: string;
	duration?: number;
	aspect_ratio?: string;
	resolution?: string;
	generate_audio?: boolean;
}

export interface ImageToVideoArgs extends VideoCommon {
	image: string;
	last_frame?: string;
	prompt?: string;
	duration?: number;
	aspect_ratio?: string;
	resolution?: string;
	generate_audio?: boolean;
}

export interface ReferenceAudio {
	voice_id?: string;
	audio?: string;
}

export interface ReferenceToVideoArgs extends VideoCommon {
	prompt?: string;
	image?: string;
	last_frame?: string;
	reference_images?: string[];
	reference_audios?: ReferenceAudio[];
	keyframes?: Array<{ image: string; timestamp_s: number }>;
	duration?: number;
	aspect_ratio?: string;
	resolution?: string;
	generate_audio?: boolean;
}

export interface VideoEditArgs extends VideoCommon {
	prompt: string;
	video: string;
}

export interface VideoExtendArgs extends VideoCommon {
	prompt: string;
	video: string;
	duration?: number;
}

export interface WebSearchArgs {
	query: string;
	allowed_domains?: string[];
	excluded_domains?: string[];
	enable_image_understanding?: boolean;
	enable_image_search?: boolean;
	max_turns?: number;
}

export interface XSearchArgs {
	query: string;
	from_date?: string;
	to_date?: string;
	allowed_x_handles?: string[];
	excluded_x_handles?: string[];
	enable_image_understanding?: boolean;
	enable_video_understanding?: boolean;
	max_turns?: number;
}

export interface TextToSpeechArgs {
	text: string;
	language: string;
	voice_id?: string;
	speed?: number;
	codec?: string;
	sample_rate?: number;
	bit_rate?: number;
	optimize_streaming_latency?: string;
	text_normalization?: boolean;
	with_timestamps?: boolean;
	replace?: Record<string, string>;
	outputPath: string;
	timestampsPath?: string;
}

export interface SpeechToTextArgs {
	file?: string;
	url?: string;
	audio_format?: string;
	sample_rate?: number;
	language?: string;
	format?: boolean;
	multichannel?: boolean;
	channels?: number;
	diarize?: boolean;
	keyterm?: string[];
	filler_words?: boolean;
	model?: string;
	vad_threshold?: number;
	outputPath?: string;
}

export interface ToolText {
	text: string;
	details: Record<string, unknown>;
}

export interface XaiClientOptions {
	apiKey: string;
	fetch?: typeof fetch;
	cwd?: string;
	baseUrl?: string;
	model?: string;
	pollIntervalMs?: number;
}

function exactlyOneDefined(a: unknown, b: unknown): boolean {
	return Boolean(a) !== Boolean(b);
}

async function parseError(response: Response): Promise<string> {
	const text = await response.text();
	try {
		const data = JSON.parse(text) as {
			error?: string | { message?: string; code?: string };
			error_description?: string;
		};
		if (typeof data.error === "string") {
			return `${data.error}: ${data.error_description ?? ""}`.trim();
		}
		return data.error?.message ?? text;
	} catch {
		return text;
	}
}

export class XaiClient {
	private readonly apiKey: string;
	private readonly fetchFn: typeof fetch;
	private readonly cwd: string;
	private readonly baseUrl: string;
	private readonly model: string | undefined;
	private readonly pollIntervalMs: number;

	constructor(options: XaiClientOptions) {
		if (!options.apiKey.trim()) {
			throw new Error("Set XAI_API_KEY to an xAI API key.");
		}
		this.apiKey = options.apiKey.trim();
		this.fetchFn = options.fetch ?? fetch;
		this.cwd = options.cwd ?? process.cwd();
		this.baseUrl = (options.baseUrl ?? API_BASE).replace(/\/$/, "");
		this.model = options.model;
		this.pollIntervalMs = options.pollIntervalMs ?? 5000;
	}

	async webSearch(args: WebSearchArgs, signal?: AbortSignal): Promise<ToolText> {
		return this.agentSearch(
			args.query,
			[
				buildWebSearchTool({
					allowedDomains: args.allowed_domains,
					excludedDomains: args.excluded_domains,
					enableImageUnderstanding: args.enable_image_understanding,
					enableImageSearch: args.enable_image_search,
				}),
			],
			args.max_turns,
			signal,
		);
	}

	async xSearch(args: XSearchArgs, signal?: AbortSignal): Promise<ToolText> {
		return this.agentSearch(
			args.query,
			[
				buildXSearchTool({
					fromDate: args.from_date,
					toDate: args.to_date,
					allowedHandles: args.allowed_x_handles,
					excludedHandles: args.excluded_x_handles,
					enableImageUnderstanding: args.enable_image_understanding,
					enableVideoUnderstanding: args.enable_video_understanding,
				}),
			],
			args.max_turns,
			signal,
		);
	}

	async imageGen(args: ImageGenArgs, signal?: AbortSignal): Promise<ToolText> {
		const { outputPath, ...body } = args;
		return this.submitImage("/images/generations", body, outputPath, signal);
	}

	async imageEdit(args: ImageEditArgs, signal?: AbortSignal): Promise<ToolText> {
		if (!exactlyOneDefined(args.image, args.images)) {
			throw new Error("Provide exactly one of image or images");
		}
		const { outputPath, image, images, ...rest } = args;
		const body: Record<string, unknown> = { ...rest };
		if (image) body.image = await this.imageInputRef(image);
		if (images) {
			body.images = await Promise.all(images.map((value) => this.imageInputRef(value)));
		}
		return this.submitImage("/images/edits", body, outputPath, signal);
	}

	async textToVideo(args: TextToVideoArgs, signal?: AbortSignal): Promise<ToolText> {
		const { outputPath, ...body } = args;
		return this.startVideo("/videos/generations", body, outputPath, signal);
	}

	async imageToVideo(args: ImageToVideoArgs, signal?: AbortSignal): Promise<ToolText> {
		const { image, last_frame, outputPath, prompt, ...rest } = args;
		const body: Record<string, unknown> = {
			...rest,
			image: await this.pictureRef(image),
		};
		if (prompt) body.prompt = prompt;
		if (last_frame) body.last_frame = await this.pictureRef(last_frame);
		return this.startVideo("/videos/generations", body, outputPath, signal);
	}

	async referenceToVideo(
		args: ReferenceToVideoArgs,
		signal?: AbortSignal,
	): Promise<ToolText> {
		const refs = args.reference_images ?? [];
		const audios = args.reference_audios ?? [];
		const frames = args.keyframes ?? [];
		if (!refs.length && !audios.length && !frames.length && !args.image && !args.last_frame) {
			throw new Error(
				"Provide reference_images, reference_audios, image, last_frame, or keyframes",
			);
		}
		if (!args.prompt && !args.image && !args.last_frame && !frames.length) {
			throw new Error(
				"Prompt is required unless image, last_frame, or keyframes pins a frame",
			);
		}
		const {
			outputPath,
			reference_images: _refs,
			reference_audios: _audios,
			keyframes: _frames,
			image,
			last_frame,
			prompt,
			...rest
		} = args;
		const body: Record<string, unknown> = { ...rest };
		if (prompt) body.prompt = prompt;
		if (image) body.image = await this.pictureRef(image);
		if (last_frame) body.last_frame = await this.pictureRef(last_frame);
		if (refs.length) {
			body.reference_images = await Promise.all(refs.map((value) => this.pictureRef(value)));
		}
		if (audios.length) {
			body.reference_audios = await Promise.all(
				audios.map(async (entry) => {
					if (entry.voice_id && entry.audio) {
						throw new Error("Each reference_audios entry needs voice_id or audio, not both");
					}
					if (entry.voice_id) return { voice_id: entry.voice_id };
					if (entry.audio) return { url: await this.mediaRef(entry.audio) };
					throw new Error("Each reference_audios entry needs voice_id or audio");
				}),
			);
		}
		if (frames.length) {
			body.keyframes = await Promise.all(
				frames.map(async (frame) => ({
					timestamp_s: frame.timestamp_s,
					image: await this.pictureRef(frame.image),
				})),
			);
		}
		return this.startVideo("/videos/generations", body, outputPath, signal);
	}

	async videoEdit(args: VideoEditArgs, signal?: AbortSignal): Promise<ToolText> {
		const { outputPath, video, ...body } = args;
		return this.startVideo(
			"/videos/edits",
			{ ...body, video: await this.pictureRef(video) },
			outputPath,
			signal,
		);
	}

	async videoExtend(args: VideoExtendArgs, signal?: AbortSignal): Promise<ToolText> {
		const { outputPath, video, ...body } = args;
		return this.startVideo(
			"/videos/extensions",
			{ ...body, video: await this.pictureRef(video) },
			outputPath,
			signal,
		);
	}

	async textToSpeech(args: TextToSpeechArgs, signal?: AbortSignal): Promise<ToolText> {
		const { outputPath, timestampsPath, codec, sample_rate, bit_rate, ...fields } = args;
		const body = buildTtsBody({
			...fields,
			codec,
			sample_rate,
			bit_rate,
			includeEmptyOutputFormat: true,
		});
		const response = await this.request(
			"/tts",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
			signal,
		);
		let audio: Buffer;
		let envelope: Record<string, unknown> | undefined;
		if (args.with_timestamps) {
			envelope = (await response.json()) as Record<string, unknown>;
			if (typeof envelope.audio !== "string") {
				throw new Error("Timestamped TTS response did not include audio");
			}
			audio = Buffer.from(envelope.audio, "base64");
		} else {
			audio = Buffer.from(await response.arrayBuffer());
		}
		const path = this.localPath(outputPath);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, audio);
		let timestampsSaved: string | undefined;
		if (timestampsPath && envelope) {
			timestampsSaved = this.localPath(timestampsPath);
			await mkdir(dirname(timestampsSaved), { recursive: true });
			await writeFile(timestampsSaved, JSON.stringify(envelope, null, 2));
		}
		const duration =
			envelope && typeof envelope.duration === "number" ? ` (${envelope.duration}s, timestamps included)` : "";
		return {
			text: `Saved speech to ${path}${duration}`,
			details: {
				path,
				bytes: audio.length,
				...(timestampsSaved ? { timestampsPath: timestampsSaved } : {}),
				...(envelope ?? {}),
			},
		};
	}

	async speechToText(args: SpeechToTextArgs, signal?: AbortSignal): Promise<ToolText> {
		if (!exactlyOneDefined(args.file, args.url)) {
			throw new Error("Provide exactly one of file or url");
		}
		const form = new FormData();
		form.append("model", resolveSttModel(args.model));
		for (const [key, value] of Object.entries(args)) {
			if (key === "file" || key === "outputPath" || key === "model" || value === undefined) continue;
			if (key === "keyterm") {
				for (const term of value as string[]) form.append("keyterm", term);
			} else {
				form.append(key, String(value));
			}
		}
		if (args.file) {
			const path = this.localPath(args.file);
			const bytes = await readFile(path);
			form.append(
				"file",
				new Blob([bytes], { type: MIME[extname(path).toLowerCase()] ?? "application/octet-stream" }),
				basename(path),
			);
		}
		const data = (await this.request("/stt", { method: "POST", body: form }, signal).then((response) =>
			response.json(),
		)) as Record<string, unknown>;
		let saved: string | undefined;
		if (args.outputPath) {
			saved = this.localPath(args.outputPath);
			await mkdir(dirname(saved), { recursive: true });
			await writeFile(saved, JSON.stringify(data, null, 2));
		}
		const transcript = typeof data.text === "string" ? data.text : "Transcription complete";
		return {
			text: `${transcript}${saved ? `\nSaved full result to ${saved}` : ""}`,
			details: { ...data, ...(saved ? { saved } : {}) },
		};
	}

	async listSpeechVoices(signal?: AbortSignal): Promise<ToolText> {
		const response = await this.fetchApi("/tts/voices", { method: "GET" }, signal);
		if (!response.ok) {
			throw new Error(`Could not list voices (${response.status}): ${await parseError(response)}`);
		}
		const builtin: unknown = await response.json();
		const customVoices: unknown[] = [];
		let customError: string | undefined;
		try {
			let token: string | undefined;
			for (let page = 0; page < 20; page++) {
				const path = token
					? `/custom-voices?limit=100&pagination_token=${encodeURIComponent(token)}`
					: "/custom-voices?limit=100";
				const custom = await this.fetchApi(path, { method: "GET" }, signal);
				if (!custom.ok) {
					customError = `GET /v1/custom-voices failed (${custom.status})`;
					break;
				}
				const parsed = customVoicePage(await custom.json());
				customVoices.push(...parsed.voices);
				if (!parsed.next) break;
				token = parsed.next;
			}
		} catch (error) {
			customError = error instanceof Error ? error.message : String(error);
		}
		const data = mergeVoiceCatalog(builtin, customVoices);
		if (customError) data.custom_voices_error = customError;
		return { text: JSON.stringify(data, null, 2), details: data };
	}

	private async agentSearch(
		query: string,
		tools: Record<string, unknown>[],
		maxTurns: number | undefined,
		signal: AbortSignal | undefined,
	): Promise<ToolText> {
		const model = this.model ?? responsesSearchModel(undefined);
		const data = await this.jsonPost(
			"/responses",
			buildAgentSearchBody({ model, query, tools, maxTurns }),
			this.searchSignal(signal),
		);
		const parsed = responsesOutputText(data);
		const cites = parsed.citations.length
			? `\n\nCitations:\n${parsed.citations.map((url) => `- ${url}`).join("\n")}`
			: "";
		return {
			text: `${parsed.text}${cites}`,
			details: { ...parsed, model, usage: searchUsage(data) },
		};
	}

	private searchSignal(signal?: AbortSignal): AbortSignal {
		const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
		if (!signal) return timeout;
		return AbortSignal.any([signal, timeout]);
	}

	private async submitImage(
		path: string,
		body: Record<string, unknown>,
		outputPath: string,
		signal?: AbortSignal,
	): Promise<ToolText> {
		const request = normalizeImageRequest(body);
		if (request.deferred === true) {
			const started = await this.jsonPost(path, request, signal);
			if (typeof started.request_id !== "string" || !started.request_id) {
				throw new Error("Deferred image request returned no request_id");
			}
			return this.imageResult(await this.pollImage(started.request_id, signal), outputPath, signal);
		}
		return this.imageResult(await this.jsonPost(path, request, signal), outputPath, signal);
	}

	private async startVideo(
		path: string,
		body: Record<string, unknown>,
		outputPath: string,
		signal?: AbortSignal,
	): Promise<ToolText> {
		const started = await this.jsonPost(path, body, signal);
		if (typeof started.request_id !== "string" || !started.request_id) {
			throw new Error("Video request returned no request_id");
		}
		return this.pollVideo(started.request_id, outputPath, signal);
	}

	private async pollImage(requestId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
		for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
			if (signal?.aborted) throw new Error("Cancelled");
			const response = await this.fetchApi(
				`/images/${encodeURIComponent(requestId)}`,
				{ method: "GET" },
				signal,
			);
			const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
			if (data.status === "done") return data;
			if (data.status === "failed") {
				throw new Error(jobError("Image", data));
			}
			if (!response.ok && response.status !== 202) {
				throw new Error(
					`Image poll failed (${response.status}): ${await errorMessage(data, response.statusText)}`,
				);
			}
			await this.sleep(signal);
		}
		throw new Error(`Image request ${requestId} did not finish`);
	}

	private async pollVideo(
		requestId: string,
		outputPath: string,
		signal?: AbortSignal,
	): Promise<ToolText> {
		for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
			if (signal?.aborted) throw new Error("Cancelled");
			const response = await this.fetchApi(
				`/videos/${encodeURIComponent(requestId)}`,
				{ method: "GET" },
				signal,
			);
			const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
			if (data.status === "done") {
				const video = isRecord(data.video) ? data.video : undefined;
				const url = video && typeof video.url === "string" ? video.url : undefined;
				if (!url) throw new Error("Completed video job returned no download URL");
				const saved = this.localPath(outputPath);
				const bytes = await this.saveRemote(url, saved, signal);
				return {
					text: `Video done; saved to ${saved}`,
					details: { ...data, saved, bytes },
				};
			}
			if (data.status === "failed" || data.status === "expired") {
				throw new Error(jobError("Video", data));
			}
			if (!response.ok && response.status !== 202) {
				throw new Error(
					`Video poll failed (${response.status}): ${await errorMessage(data, response.statusText)}`,
				);
			}
			await this.sleep(signal);
		}
		throw new Error(`Video request ${requestId} did not finish`);
	}

	private async imageResult(
		data: Record<string, unknown>,
		outputPath: string,
		signal?: AbortSignal,
	): Promise<ToolText> {
		const items = Array.isArray(data.data) ? data.data : [];
		if (!items.length) throw new Error("No images returned");
		const base = this.localPath(outputPath);
		const saved = await Promise.all(
			items.map(async (item, index) => {
				if (!isRecord(item)) throw new Error(`Image ${index + 1} contained no downloadable content`);
				const path =
					items.length === 1
						? base
						: join(
								dirname(base),
								`${basename(base, extname(base)) || "image"}-${index + 1}${extname(base) || ".png"}`,
							);
				await mkdir(dirname(path), { recursive: true });
				if (typeof item.b64_json === "string") {
					await writeFile(path, Buffer.from(item.b64_json, "base64"));
				} else if (typeof item.url === "string") {
					await this.saveRemote(item.url, path, signal);
				} else {
					throw new Error(`Image ${index + 1} contained no downloadable content`);
				}
				return path;
			}),
		);
		return {
			text: `Saved ${saved.length} image(s): ${saved.join(", ")}`,
			details: { ...data, saved },
		};
	}

	private async imageInputRef(
		value: string,
	): Promise<{ file_id: string } | { url: string; type: "image_url" }> {
		if (/^file_/i.test(value)) return { file_id: value };
		return { url: await this.mediaRef(value), type: "image_url" };
	}

	private async pictureRef(value: string): Promise<{ file_id: string } | { url: string }> {
		if (/^file_/i.test(value)) return { file_id: value };
		return { url: await this.mediaRef(value) };
	}

	private async mediaRef(value: string): Promise<string> {
		if (/^(https?:|data:|file_)/i.test(value)) return value;
		const path = this.localPath(value);
		const data = await readFile(path);
		const mime = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
		return `data:${mime};base64,${data.toString("base64")}`;
	}

	private localPath(value: string): string {
		return resolve(this.cwd, value.replace(/^@/, ""));
	}

	private async saveRemote(url: string, path: string, signal?: AbortSignal): Promise<number> {
		const response = await this.fetchFn(url, { signal });
		if (!response.ok) {
			throw new Error(`Media download failed (${response.status}): ${await response.text()}`);
		}
		const data = Buffer.from(await response.arrayBuffer());
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, data);
		return data.length;
	}

	private async jsonPost(
		path: string,
		body: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<Record<string, unknown>> {
		const response = await this.request(
			path,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
			signal,
		);
		return (await response.json()) as Record<string, unknown>;
	}

	private async request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
		const response = await this.fetchApi(path, init, signal);
		if (!response.ok) {
			throw new Error(`xAI request failed (${response.status}): ${await parseError(response)}`);
		}
		return response;
	}

	private async fetchApi(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
		if (signal?.aborted) throw new Error("Cancelled");
		const headers = new Headers(init.headers);
		headers.set("Authorization", `Bearer ${this.apiKey}`);
		return this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers, signal });
	}

	private async sleep(signal?: AbortSignal): Promise<void> {
		if (this.pollIntervalMs <= 0) return;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, this.pollIntervalMs);
			signal?.addEventListener(
				"abort",
				() => {
					clearTimeout(timer);
					reject(new Error("Cancelled"));
				},
				{ once: true },
			);
		});
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function jobError(kind: string, data: Record<string, unknown>): string {
	const error = isRecord(data.error) ? data.error : undefined;
	const code = error && typeof error.code === "string" ? error.code : "error";
	const message = error && typeof error.message === "string" ? error.message : "unknown error";
	return `${kind} ${String(data.status)}: ${code}: ${message}`;
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
	const error = isRecord(data.error) ? data.error : undefined;
	return error && typeof error.message === "string" ? error.message : fallback;
}
