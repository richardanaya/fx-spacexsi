import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("package.json is the public fx-spacexsi manifest", async () => {
	const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
		name: string;
		version: string;
		license: string;
		author: string;
		repository: { url: string };
		bugs: { url: string };
		homepage: string;
		publishConfig: { access: string };
	};
	assert.equal(pkg.name, "fx-spacexsi");
	assert.equal(pkg.version, "0.1.0");
	assert.equal(pkg.license, "MIT");
	assert.equal(pkg.author, "Richard Anaya");
	assert.equal(pkg.repository.url, "git+https://github.com/richardanaya/fx-spacexsi.git");
	assert.equal(pkg.bugs.url, "https://github.com/richardanaya/fx-spacexsi/issues");
	assert.equal(pkg.homepage, "https://github.com/richardanaya/fx-spacexsi#readme");
	assert.equal(pkg.publishConfig.access, "public");
});

test("license names Richard Anaya in 2026", async () => {
	const license = await readFile(join(root, "LICENSE"), "utf8");
	assert.match(license, /^MIT License/);
	assert.match(license, /Copyright \(c\) 2026 Richard Anaya/);
});
