#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { XaiClient } from "./client.ts";
import { createServer } from "./server.ts";

const apiKey = process.env.XAI_API_KEY?.trim();
if (!apiKey) {
	console.error("fx-spacexsi: set XAI_API_KEY to an xAI API key.");
	process.exit(1);
}

const client = new XaiClient({
	apiKey,
	model: process.env.XAI_MODEL?.trim() || undefined,
});
const server = createServer(client);
await server.connect(new StdioServerTransport());
