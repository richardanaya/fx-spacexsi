/**
 * One-shot web search through the same client the MCP server uses.
 *
 *   XAI_API_KEY=... node --experimental-strip-types examples/search.ts "latest Starship flight"
 */
import { XaiClient } from "../src/client.ts";

const apiKey = process.env.XAI_API_KEY?.trim();
if (!apiKey) {
	console.error("Set XAI_API_KEY");
	process.exit(1);
}

const client = new XaiClient({ apiKey, model: process.env.XAI_MODEL?.trim() || undefined });
const result = await client.webSearch({ query: process.argv[2] ?? "latest Starship flight" });
console.log(result.text);
