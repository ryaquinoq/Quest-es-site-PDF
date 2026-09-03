import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

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

test("vendored PDF.js runtime matches the pinned dependency", async () => {
  for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
    const vendored = await readFile(`vendor/pdfjs/${file}`);
    const installed = await readFile(`node_modules/pdfjs-dist/build/${file}`);
    assert.deepEqual(vendored, installed, `${file} must be copied from pdfjs-dist 5.6.205`);
  }
});
