import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("test harness loads ES modules", () => {
  assert.equal(typeof structuredClone, "function");
});

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`static server exited before listening (code ${child.exitCode})`);
    }
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`timed out waiting for static server at ${url}`);
}

test("static server serves repository files and rejects invalid paths", async (t) => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  t.after(() => child.kill());

  const baseUrl = `http://127.0.0.1:${port}`;
  const indexResponse = await waitForServer(`${baseUrl}/`, child);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type"), /^text\/html/);

  const missingResponse = await fetch(`${baseUrl}/missing.txt`);
  assert.equal(missingResponse.status, 404);

  const traversalResponse = await fetch(`${baseUrl}/..%2fpackage.json`);
  assert.equal(traversalResponse.status, 403);
});

test("static server rejects traversal to a sibling with a common path prefix", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "medup-server-"));
  const root = join(sandbox, "site");
  const sibling = join(sandbox, "site-private");
  await mkdir(root);
  await mkdir(sibling);
  await writeFile(join(root, "index.html"), "MedUp");
  await writeFile(join(sibling, "secret.txt"), "private");

  const port = await availablePort();
  const serveScript = fileURLToPath(new URL("../../scripts/serve.mjs", import.meta.url));
  const child = spawn(process.execPath, [serveScript], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  t.after(async () => {
    child.kill();
    await rm(sandbox, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/`, child);
  const response = await fetch(`${baseUrl}/..%2fsite-private%2fsecret.txt`);
  assert.equal(response.status, 403);
});

test("fixture set preserves every import shape needed by later parser tests", async () => {
  const fixture = async (name) => readFile(`tests/fixtures/${name}`, "utf8");
  const [canonical, legacy, generic, malformed, sampleJson] = await Promise.all([
    fixture("medup-docs.txt"),
    fixture("legacy-current-prompt.txt"),
    fixture("generic-markdown.txt"),
    fixture("malformed.txt"),
    fixture("current-sample.json"),
  ]);

  assert.equal(canonical.match(/^=== INICIO DA QUESTAO ===$/gm)?.length, 2);
  assert.equal(canonical.match(/^=== FIM DA QUESTAO ===$/gm)?.length, 2);
  assert.equal(canonical.match(/^Resposta correta: [A-D]$/gm)?.length, 2);

  assert.match(legacy, /^Questão 1 .+ \| Clínica$/m);
  assert.match(legacy, /^A\) .+$/m);
  assert.match(legacy, /^🎯 Take home message: .+$/m);
  assert.ok(legacy.indexOf("GABARITO E FEEDBACK DETALHADO") > legacy.indexOf("Questão 2"));
  assert.match(legacy, /^Questão 1 — Resposta correta: [A-D]$/m);

  assert.match(generic, /^## Questão 1$/m);
  assert.match(generic, /^A\. .+$/m);
  assert.match(generic, /^Resposta: [A-D]$/m);

  assert.equal(malformed.match(/^=== INICIO DA QUESTAO ===$/gm)?.length, 2);
  assert.equal(malformed.match(/^Resposta correta: [A-D]$/gm)?.length, 1);

  const sample = JSON.parse(sampleJson);
  assert.equal(sample.version, 1);
  assert.equal(sample.questions.length, 10);
  assert.equal(sample.questions[0].feedback.correctOption, "B");
});

test("PDF.js dependency uses the patched release and its effective Node minimum", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const installed = JSON.parse(await readFile("node_modules/pdfjs-dist/package.json", "utf8"));

  assert.equal(manifest.devDependencies["pdfjs-dist"], "6.3.289");
  assert.equal(manifest.engines.node, ">=22.13.0");
  assert.equal(installed.version, "6.3.289");
});

test("vendored PDF.js runtime matches the pinned dependency", async () => {
  for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
    const vendored = await readFile(`vendor/pdfjs/${file}`);
    const installed = await readFile(`node_modules/pdfjs-dist/build/${file}`);
    assert.deepEqual(vendored, installed, `${file} must match the patched pdfjs-dist release`);
  }
});
