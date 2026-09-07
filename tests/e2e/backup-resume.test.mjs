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

async function openApp(t) {
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
  page.setDefaultTimeout(4_000);
  await page.goto(`${baseUrl}/`);
  return page;
}

async function importFixture(page) {
  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByRole("heading", { name: "Questão 1" }).waitFor();
}

async function storedQuizzes(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("medup", 2);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction("quizzes", "readonly")
          .objectStore("quizzes").getAll();
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error), { once: true });
      });
    } finally {
      database.close();
    }
  });
}

async function waitForStoredQuiz(page, condition, description, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const quizzes = await storedQuizzes(page);
    const match = quizzes.find(condition);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function downloadBackup(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  return {
    name: download.suggestedFilename(),
    backup: JSON.parse(await readFile(path, "utf8"))
  };
}

test("continues the last studied quiz at its persisted question after reload", async t => {
  const page = await openApp(t);
  await importFixture(page);

  await page.locator("[data-option]").first().click();
  await page.getByRole("button", { name: "Próxima" }).click();
  await waitForStoredQuiz(
    page,
    quiz => quiz.progress?.selectedQuestion === 1 && quiz.study?.lastStudiedAt,
    "persisted study progress"
  );

  await page.reload();
  await page.getByRole("heading", { name: "Biblioteca" }).waitFor();
  const resume = page.locator("[data-resume-quiz]");
  assert.match(await resume.textContent(), /Simulado de Clínica Médica/i);
  assert.match(await resume.textContent(), /1\/2 respondidas/i);
  await resume.getByRole("button", { name: "Continuar estudando" }).click();
  await page.getByRole("heading", { name: "Questão 2" }).waitFor();
});

test("opening the library does not update lastStudiedAt", async t => {
  const page = await openApp(t);
  await importFixture(page);
  await page.locator("[data-option]").first().click();
  const before = await waitForStoredQuiz(
    page,
    quiz => Boolean(quiz.study?.lastStudiedAt),
    "last-studied timestamp"
  );

  await page.getByRole("button", { name: "Biblioteca" }).click();
  await page.getByRole("heading", { name: "Biblioteca" }).waitFor();
  const [after] = await storedQuizzes(page);

  assert.equal(after.study.lastStudiedAt, before.study.lastStudiedAt);
});

test("downloads a complete versioned library backup", async t => {
  const page = await openApp(t);
  await importFixture(page);
  await page.getByRole("button", { name: "Biblioteca" }).click();

  const { name, backup } = await downloadBackup(page);

  assert.match(name, /^medup-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(backup.format, "medup-backup");
  assert.equal(backup.version, 1);
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(backup.quizzes.length, 1);
  assert.equal(backup.quizzes[0].title, "Simulado de Clínica Médica");
  assert.equal(backup.quizzes[0].questions.length, 2);
});

test("rejects invalid restores and previews preserve and replace conflicts", async t => {
  const page = await openApp(t);
  await importFixture(page);
  await page.getByRole("button", { name: "Biblioteca" }).click();
  const originalRow = page.locator('[data-library-quiz="Simulado de Clínica Médica"]');
  await originalRow.waitFor();

  await page.locator("#library-restore-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not-json")
  });
  await page.locator("#app-notice").waitFor();
  assert.match(await page.locator("#app-notice").textContent(), /Backup inválido/i);
  assert.equal(await page.locator("[data-library-quiz]").count(), 1);
  await originalRow.waitFor();

  const { backup } = await downloadBackup(page);
  backup.quizzes[0].title = "Cardiologia substituída";
  backup.quizzes.push({
    ...structuredClone(backup.quizzes[0]),
    id: "restored-quiz",
    title: "Neurologia restaurada"
  });
  const file = {
    name: "medup-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  };

  await page.locator("#library-restore-file").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Restaurar backup" });
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /2 simulados/i);
  assert.match(await dialog.textContent(), /1 conflito/i);
  assert.equal(await page.locator("[data-library-quiz]").count(), 1);
  await dialog.getByRole("button", { name: "Preservar existentes" }).click();
  await page.locator('[data-library-quiz="Neurologia restaurada"]').waitFor();
  await originalRow.waitFor();

  await page.locator("#library-restore-file").setInputFiles(file);
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /2 conflitos/i);
  await dialog.getByRole("button", { name: "Substituir conflitos" }).click();
  await page.locator('[data-library-quiz="Cardiologia substituída"]').waitFor();
  await originalRow.waitFor({ state: "detached" });
});

test("keeps a replaced active quiz restored after returning to study", async t => {
  const page = await openApp(t);
  await importFixture(page);
  await page.getByRole("button", { name: "Biblioteca" }).click();

  const { backup } = await downloadBackup(page);
  backup.quizzes[0].title = "Versão restaurada";
  backup.quizzes[0].questions[0].prompt = "Enunciado vindo do backup restaurado.";
  backup.quizzes[0].progress = {
    answers: {},
    answered: 0,
    correct: 0,
    finalized: false,
    selectedQuestion: 0
  };
  await page.locator("#library-restore-file").setInputFiles({
    name: "replace-active.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });
  await page.getByRole("dialog", { name: "Restaurar backup" })
    .getByRole("button", { name: "Substituir conflitos" }).click();
  await page.locator('[data-library-quiz="Versão restaurada"]').waitFor();

  await page.getByRole("button", { name: "Simulado" }).click();
  await page.locator("[data-option]").first().click();
  const persisted = await waitForStoredQuiz(
    page,
    quiz => Boolean(quiz.study?.lastStudiedAt),
    "answered restored quiz"
  );

  assert.equal(persisted.title, "Versão restaurada");
  assert.equal(persisted.questions[0].prompt, "Enunciado vindo do backup restaurado.");
});
