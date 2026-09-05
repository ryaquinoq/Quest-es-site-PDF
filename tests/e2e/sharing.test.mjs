import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";

import { chromium } from "playwright";

import { createQuiz } from "../../js/core/quiz-schema.js";

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
    if (child.exitCode !== null) throw new Error(`static server exited (code ${child.exitCode})`);
    try {
      return await fetch(url);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw new Error(`timed out waiting for static server at ${url}`);
}

async function importJson(page, quiz) {
  await page.getByRole("button", { name: "Importar" }).click();
  await page.getByLabel("Texto das questões").fill(JSON.stringify(quiz));
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.locator("[data-study-question]").waitFor();
}

test("shares a small quiz by link and a large quiz as offline HTML", async t => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  const browser = await chromium.launch({ headless: true });
  const outputDirectory = await mkdtemp(join(tmpdir(), "medup-sharing-"));

  t.after(async () => {
    await browser.close();
    child.kill();
    await rm(outputDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/`, child);
  const context = await browser.newContext({ acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const page = await context.newPage();
  page.setDefaultTimeout(6_000);
  await page.goto(`${baseUrl}/`);

  const smallQuiz = createQuiz({
    id: "small-share",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    title: "Unicode: coração e ação",
    questions: [{
      prompt: "Qual conduta é indicada?",
      options: { A: "Ação imediata", B: "Observação" },
      correctOption: "A",
      feedback: { A: "Correta.", B: "Incorreta." }
    }]
  });
  await importJson(page, smallQuiz);
  await page.getByRole("button", { name: "Exportar" }).click();
  const copyLink = page.getByRole("button", { name: "Copiar link" });
  await copyLink.waitFor();
  assert.equal(await copyLink.isEnabled(), true);
  await copyLink.click();
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(sharedUrl, /#quiz=v2\.[A-Za-z0-9_-]+$/);

  const sharedPage = await context.newPage();
  sharedPage.setDefaultTimeout(6_000);
  await sharedPage.goto(sharedUrl);
  await sharedPage.getByText("Qual conduta é indicada?", { exact: true }).waitFor();
  await sharedPage.getByRole("button", { name: /Ação imediata/ }).click();
  assert.equal(
    await sharedPage.getByRole("button", { name: /Ação imediata/ }).getAttribute("aria-pressed"),
    "true"
  );
  assert.equal(await sharedPage.locator("#tab-editor").isDisabled(), true);

  const longQuiz = JSON.parse(await readFile("tests/fixtures/long-quiz.json", "utf8"));
  await importJson(page, longQuiz);
  await page.getByRole("button", { name: "Exportar" }).click();
  const disabledCopyLink = page.getByRole("button", { name: "Copiar link" });
  await disabledCopyLink.waitFor();
  assert.equal(await disabledCopyLink.isDisabled(), true);
  await page.getByText(/grande demais para compartilhar por link/i).waitFor();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar HTML" }).click();
  const download = await downloadPromise;
  const htmlPath = join(outputDirectory, "simulado-offline.html");
  await download.saveAs(htmlPath);

  const offlinePage = await context.newPage();
  offlinePage.setDefaultTimeout(6_000);
  await offlinePage.goto(pathToFileURL(htmlPath).href);
  await offlinePage.locator("[data-study-question]").first().waitFor();
  await offlinePage.locator("[data-study-question]").first().locator("[data-option]").first().click();
  await offlinePage.locator("[data-option-feedback]:visible").waitFor();
});
