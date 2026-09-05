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

test("persists imported quizzes and canonical editor changes across reloads", async t => {
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
  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  const page = await browser.newPage();
  page.setDefaultTimeout(4_000);

  await page.goto(`${baseUrl}/`);
  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByRole("heading", { name: "Questão 1" }).waitFor();

  await page.reload();
  await page.getByRole("heading", { name: "Biblioteca" }).waitFor();
  const row = page.locator('[data-library-quiz="Simulado de Clínica Médica"]');
  await row.waitFor();
  assert.match(await row.textContent(), /2 questões/i);

  await row.getByRole("button", { name: "Editar" }).click();
  await page.getByRole("heading", { name: "Editar simulado" }).waitFor();
  const changedPrompt = "Enunciado revisado e persistido pela biblioteca local.";
  await page.getByLabel("Enunciado da questão").fill("");
  await page.getByRole("button", { name: "Biblioteca" }).click();
  await page.getByRole("heading", { name: "Editar simulado" }).waitFor();
  assert.match(await page.getByRole("alert").textContent(), /enunciado.*vazio/i);
  await page.getByLabel("Enunciado da questão").fill(changedPrompt);
  await page.getByRole("button", { name: "Duplicar questão" }).click();
  await page.locator("[data-editor-question]").nth(2).waitFor();
  assert.equal(await page.locator("[data-editor-question]").count(), 3);

  await page.getByRole("button", { name: "Mover questão para baixo" }).click();
  await page.locator("[data-editor-question].active").getByText("Questão 3").waitFor();
  await page.getByRole("button", { name: "Excluir questão" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /Questão 3/i);
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await page.locator("[data-editor-question]").nth(2).waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-editor-question]").count(), 2);

  await page.reload();
  await page.getByRole("heading", { name: "Biblioteca" }).waitFor();
  const persistedRow = page.locator('[data-library-quiz="Simulado de Clínica Médica"]');
  assert.match(await persistedRow.textContent(), /2 questões/i);
  await persistedRow.getByRole("button", { name: "Editar" }).click();
  await page.getByRole("heading", { name: "Editar simulado" }).waitFor();
  assert.equal(await page.locator("[data-editor-question]").count(), 2);
  assert.equal(await page.getByLabel("Enunciado da questão").inputValue(), changedPrompt);
});

test("an imported local quiz leaves shared-link read-only mode", async t => {
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
  const shared = encodeURIComponent(JSON.stringify({
    title: "Compartilhado",
    questions: [{
      prompt: "Questão somente leitura",
      options: { A: "Sim", B: "Não" },
      correctOption: "A"
    }]
  }));
  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  const page = await browser.newPage();
  page.setDefaultTimeout(4_000);

  await page.goto(`${baseUrl}/#quiz=${shared}`);
  await page.getByRole("button", { name: "Importar" }).click();
  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByRole("heading", { name: "Questão 1" }).waitFor();
  await page.getByRole("button", { name: "Editar Questões" }).click();
  await page.getByRole("heading", { name: "Editar simulado" }).waitFor();

  await page.goto(`${baseUrl}/#quiz=${shared}`);
  await page.reload();
  assert.equal(await page.getByRole("button", { name: "Editar Questões" }).isDisabled(), true);
  await page.getByRole("button", { name: "Biblioteca" }).click();
  const localQuiz = page.locator('[data-library-quiz="Simulado de Clínica Médica"]');
  await localQuiz.waitFor();
  await localQuiz.getByRole("button", { name: "Editar" }).click();
  await page.getByRole("heading", { name: "Editar simulado" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Editar Questões" }).isEnabled(), true);
});
