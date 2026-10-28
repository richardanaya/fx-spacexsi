import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { XaiClient } from "../src/client.ts";

interface Call {
	url: string;
	method: string;
	body: string | undefined;
	authorization: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function clientWith(handler: (call: Call) => Promise<Response> | Response, cwd?: string) {
	const calls: Call[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = String(input);
		const headers = new Headers(init?.headers);
		let body: string | undefined;
		if (typeof init?.body === "string") body = init.body;
		else if (init?.body instanceof FormData) body = `form:${[...init.body.keys()].join(",")}`;
		const call: Call = {
			url,
			method: init?.method ?? "GET",
			body,
			authorization: headers.get("authorization"),
		};
		calls.push(call);
		return handler(call);
	};
	return {
		calls,
		client: new XaiClient({
			apiKey: "test-key",
			fetch: fetchImpl,
			cwd,
			pollIntervalMs: 0,
		}),
	};
}

test("web search posts grok-4.7 responses with a web_search tool", async () => {
	const { calls, client } = clientWith((call) => {
		assert.equal(call.authorization, "Bearer test-key");
		return jsonResponse({
			output: [
				{
					type: "message",
					content: [
						{
							type: "output_text",
							text: "Starship flew.",
							annotations: [{ type: "url_citation", url: "https://example.com/a" }],
						},
					],
				},
			],
		});
	});
	const result = await client.webSearch({
		query: "latest starship flight",
		allowed_domains: ["example.com"],
		max_turns: 2,
	});
	assert.match(result.text, /Starship flew/);
	assert.match(result.text, /https:\/\/example.com\/a/);
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.url, "https://api.x.ai/v1/responses");
	const body = JSON.parse(calls[0]?.body ?? "{}") as {
		model: string;
		input: string;
		tools: Array<{ type: string; filters?: { allowed_domains: string[] } }>;
		max_turns: number;
		reasoning: { effort: string };
	};
	assert.equal(body.model, "grok-4.7");
	assert.equal(body.input, "latest starship flight");
	assert.equal(body.max_turns, 2);
	assert.deepEqual(body.reasoning, { effort: "low" });
	assert.equal(body.tools[0]?.type, "web_search");
	assert.deepEqual(body.tools[0]?.filters, { allowed_domains: ["example.com"] });
});

test("image generation rejects quality off 2.0 before the request", async () => {
	const { calls, client } = clientWith(() => jsonResponse({}));
	await assert.rejects(
		() =>
			client.imageGen({
				model: "grok-imagine-image-quality",
				prompt: "cat",
				quality: "low",
				outputPath: "cat.png",
			}),
		/only supported on grok-imagine-image-2.0/,
	);
	assert.equal(calls.length, 0);
});

test("image generation writes a downloaded url", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "fx-spacexsi-"));
	const { calls, client } = clientWith((call) => {
		if (call.url.endsWith("/images/generations")) {
			return jsonResponse({ data: [{ url: "https://cdn.example/cat.png" }] });
		}
		assert.equal(call.url, "https://cdn.example/cat.png");
		return new Response(Buffer.from("png-bytes"));
	}, cwd);
	const result = await client.imageGen({
		model: "grok-imagine-image-2.0",
		prompt: "cat",
		quality: "medium",
		outputPath: "out/cat.png",
	});
	assert.match(result.text, /Saved 1 image/);
	assert.equal(await readFile(join(cwd, "out/cat.png"), "utf8"), "png-bytes");
	const body = JSON.parse(calls[0]?.body ?? "{}") as { quality: string };
	assert.equal(body.quality, "medium");
});

test("image edit sends a file id and one local data uri", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "fx-spacexsi-"));
	await writeFile(join(cwd, "src.png"), Buffer.from("png"));
	const { calls, client } = clientWith(() => {
		return jsonResponse({ data: [{ b64_json: Buffer.from("out").toString("base64") }] });
	}, cwd);
	await client.imageEdit({
		model: "grok-imagine-image-2.0",
		prompt: "sketch",
		images: ["file_abc", "src.png"],
		outputPath: "edited.png",
	});
	const body = JSON.parse(calls[0]?.body ?? "{}") as {
		images: Array<{ file_id?: string; url?: string; type?: string }>;
	};
	assert.equal(calls[0]?.url, "https://api.x.ai/v1/images/edits");
	assert.deepEqual(body.images[0], { file_id: "file_abc" });
	assert.equal(body.images[1]?.type, "image_url");
	assert.match(body.images[1]?.url ?? "", /^data:image\/png;base64,/);
	assert.equal(await readFile(join(cwd, "edited.png"), "utf8"), "out");
});

test("text to speech posts no model field and writes audio", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "fx-spacexsi-"));
	const { calls, client } = clientWith(() => new Response(Buffer.from("mp3")), cwd);
	const result = await client.textToSpeech({
		text: "hello",
		language: "en",
		voice_id: "leo",
		outputPath: "hello.mp3",
	});
	assert.match(result.text, /hello\.mp3/);
	const body = JSON.parse(calls[0]?.body ?? "{}") as { model?: string; text: string };
	assert.equal(calls[0]?.url, "https://api.x.ai/v1/tts");
	assert.equal("model" in body, false);
	assert.equal(body.text, "hello");
	assert.equal(await readFile(join(cwd, "hello.mp3"), "utf8"), "mp3");
});

test("speech to text rewrites the retired model and accepts a url", async () => {
	const { calls, client } = clientWith(() => jsonResponse({ text: "transcribed" }));
	const result = await client.speechToText({
		url: "https://cdn.example/a.wav",
		model: "grok-voice-transcribe-1.0",
		keyterm: ["Starship"],
	});
	assert.equal(result.text, "transcribed");
	assert.equal(calls[0]?.url, "https://api.x.ai/v1/stt");
	assert.match(calls[0]?.body ?? "", /form:model,url,keyterm/);
});

test("voice catalog merges custom pages", async () => {
	const { client } = clientWith((call) => {
		if (call.url.endsWith("/tts/voices")) return jsonResponse({ voices: [{ voice_id: "eve" }] });
		if (call.url.includes("pagination_token=next")) return jsonResponse({ voices: [{ voice_id: "b" }] });
		return jsonResponse({ voices: [{ voice_id: "a" }], pagination_token: "next" });
	});
	const result = await client.listSpeechVoices();
	assert.deepEqual(result.details.voices, [{ voice_id: "eve" }]);
	assert.deepEqual(result.details.custom_voices, [{ voice_id: "a" }, { voice_id: "b" }]);
});

test("video generation polls until the file is saved", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "fx-spacexsi-"));
	const { calls, client } = clientWith((call) => {
		if (call.url.endsWith("/videos/generations")) return jsonResponse({ request_id: "req_1" });
		if (call.url.endsWith("/videos/req_1")) {
			return jsonResponse({ status: "done", video: { url: "https://cdn.example/clip.mp4" } });
		}
		return new Response(Buffer.from("mp4"));
	}, cwd);
	const result = await client.textToVideo({
		model: "grok-imagine-video-1.5",
		prompt: "pan out",
		outputPath: "clip.mp4",
	});
	assert.match(result.text, /clip\.mp4/);
	assert.equal(calls[1]?.url, "https://api.x.ai/v1/videos/req_1");
	assert.equal(await readFile(join(cwd, "clip.mp4"), "utf8"), "mp4");
});
