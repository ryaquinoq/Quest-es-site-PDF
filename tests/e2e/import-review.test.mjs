import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";

import { chromium } from "playwright";

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
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
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw new Error(`timed out waiting for static server at ${url}`);
}

test("reviews a partial import and loads only the accepted question", async t => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    child.kill();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/`, child);

  const page = await browser.newPage();
  const source = await readFile("tests/fixtures/malformed.txt", "utf8");
  await page.goto(`${baseUrl}/`);
  page.setDefaultTimeout(3_000);
  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();

  assert.equal(await page.locator('[data-status="ready"]').count(), 1);
  assert.equal(await page.locator('[data-status="blocked"]').count(), 1);

  await page.getByRole("button", { name: "Corrigir" }).nth(1).click();
  await page.waitForFunction(() => {
    const editor = document.querySelector('[data-import-question-editor="1"]');
    return editor && document.activeElement === editor &&
      Math.abs(editor.getBoundingClientRect().top - 24) < 2;
  });
  await page.locator("[data-import-question-editor]").getByRole("radio").nth(1).check();
  assert.equal(await page.locator('[data-status="blocked"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: "Confirmar importação" }).isEnabled(), true);

  await page.getByLabel("Texto das questões").fill("");
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("#import-review-title").count(), 0);

  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("checkbox", { name: "Excluir questão 2" }).check();
  await page.getByRole("button", { name: "Confirmar importação" }).click();

  await page.getByRole("heading", { name: "Questão 1" }).waitFor();
  assert.equal(await page.locator("[data-study-question]").count(), 1);
  await page.locator("[data-study-question]")
    .getByText("Qual método confirma a pressão arterial fora do consultório?", { exact: true })
    .waitFor();
});

test("shared-link state takes precedence over a locally saved quiz", async t => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    child.kill();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/`, child);

  const page = await browser.newPage();
  await page.goto(`${baseUrl}/`);
  page.setDefaultTimeout(3_000);
  await page.evaluate(() => {
    localStorage.setItem("medup.quiz", JSON.stringify({
      title: "Simulado local",
      questions: [{
        number: 1,
        prompt: "Este conteúdo local não deve abrir.",
        options: { A: "Sim", B: "Não" },
        correctOption: "A"
      }]
    }));
  });

  await page.goto(`${baseUrl}/#quiz=v2.payload-pendente`);
  await page.reload();
  const status = page.locator("#app-notice");
  assert.match(await status.textContent(), /link compartilhado não pôde ser aberto/i);
  assert.equal(await status.isVisible(), true);
  assert.equal(await page.getByText("Este conteúdo local não deve abrir.").count(), 0);
});
