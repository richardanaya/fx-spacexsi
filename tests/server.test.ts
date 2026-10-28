import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XaiClient } from "../src/client.ts";
import { TOOL_NAMES, createServer } from "../src/server.ts";

test("fx mcp server lists imagine, speech, and search tools", async () => {
	const fetchImpl: typeof fetch = async () =>
		new Response(
			JSON.stringify({
				output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	const server = createServer(new XaiClient({ apiKey: "test-key", fetch: fetchImpl, pollIntervalMs: 0 }));
	const mcp = new Client({ name: "test", version: "0.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
	const listed = await mcp.listTools();
	assert.deepEqual(
		listed.tools.map((tool) => tool.name).sort(),
		[...TOOL_NAMES].sort(),
	);
	const result = await mcp.callTool({ name: "web_search", arguments: { query: "starship" } });
	assert.equal(result.isError, undefined);
	const content = result.content as Array<{ type: string; text?: string }>;
	assert.equal(content[0]?.type, "text");
	assert.match(content[0]?.text ?? "", /ok/);
	await mcp.close();
	await server.close();
});
