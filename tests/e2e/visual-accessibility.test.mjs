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
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`static server exited (code ${child.exitCode})`);
    try {
      return await fetch(url);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function assertNoDocumentOverflow(page, width, height) {
  await page.setViewportSize({ width, height });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${width}x${height} overflowed by ${dimensions.scrollWidth - dimensions.clientWidth}px`
  );
}

test("academic shell is semantic, keyboard operable, and fluid", async t => {
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5_000);
  await page.goto(`${baseUrl}/`);

  assert.equal(await page.locator("main").count(), 1);
  await page.getByRole("navigation", { name: "Navegação principal" }).waitFor();
  assert.equal(await page.locator("h1").count(), 1);

  const importNavigation = page.getByRole("button", { name: "Importar" }).first();
  await importNavigation.focus();
  const focusStyle = await importNavigation.evaluate(element => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  assert.notEqual(focusStyle.outlineStyle, "none");
  assert.notEqual(focusStyle.outlineWidth, "0px");

  for (const [width, height] of [[390, 844], [768, 1024], [1440, 1000]]) {
    await assertNoDocumentOverflow(page, width, height);
  }

  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByRole("heading", { name: "Questão 1" }).waitFor();

  const optionA = page.getByRole("button", { name: /^Alternativa A:/ });
  await optionA.focus();
  await page.keyboard.press("Enter");
  assert.equal(await optionA.getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Favoritar" }).click();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("heading", { name: "Questão 2" }).waitFor();
  await page.getByRole("button", { name: "Dúvida", exact: true }).click();
  await page.getByRole("button", { name: /Favoritas 1/ }).click();
  await page.getByRole("heading", { name: "Questão 1" }).waitFor();
  await page.getByRole("button", { name: /Todas 2/ }).click();
  await page.getByRole("button", { name: "Ir para questão 2" }).click();
  await page.getByRole("button", { name: /^Alternativa B:/ }).click();
  await page.getByRole("button", { name: "Finalizar simulado" }).click();
  await page.getByRole("button", { name: "Revisar 2 erros" }).click();
  await page.getByRole("heading", { name: "Questão 1" }).waitFor();
  await page.getByRole("button", { name: /^Alternativa B:/ }).click();
  await page.getByRole("button", { name: "Próxima" }).click();
  await page.getByRole("button", { name: /^Alternativa A:/ }).click();
  await page.getByRole("button", { name: "Concluir revisão" }).click();
  await page.getByRole("heading", { name: "Revisão de erros concluída" }).waitFor();
  await page.getByRole("button", { name: "Voltar ao resultado" }).click();
  await page.getByRole("heading", { name: "Revisão do simulado" }).waitFor();

  for (const [width, height] of [[390, 844], [768, 1024], [1440, 1000]]) {
    await assertNoDocumentOverflow(page, width, height);
  }
});

test("study progress persists and startup hydration does not steal navigation", async t => {
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
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  page.setDefaultTimeout(6_000);
  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  await page.goto(`${baseUrl}/`);
  await page.getByLabel("Texto das questões").fill(source);
  await page.getByRole("button", { name: "Analisar questões" }).click();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByRole("button", { name: /^Alternativa A:/ }).click();
  await page.getByRole("button", { name: "Biblioteca" }).click();
  const row = page.locator('[data-library-quiz="Simulado de Clínica Médica"]');
  await row.waitFor();
  assert.match(await row.textContent(), /1\/2 respondidas/i);

  await page.reload();
  await row.waitFor();
  assert.match(await row.textContent(), /1\/2 respondidas/i);
  await row.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("button", { name: "Limpar resposta" }).click();
  await page.getByRole("button", { name: "Biblioteca" }).click();
  assert.match(await row.textContent(), /0\/2 respondidas/i);

  await row.getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("button", { name: /^Alternativa A:/ }).click();
  await page.getByRole("button", { name: "Finalizar simulado" }).click();
  await page.getByRole("heading", { name: "Revisão do simulado" }).waitFor();
  await page.reload();
  await page.locator('[data-library-quiz="Simulado de Clínica Médica"]').getByRole("button", { name: "Abrir" }).click();
  await page.getByRole("heading", { name: "Revisão do simulado" }).waitFor();
  await page.getByRole("button", { name: "Reiniciar simulado" }).click();
  await page.getByRole("button", { name: "Biblioteca" }).click();
  assert.match(await row.textContent(), /0\/2 respondidas/i);

  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      document.querySelector("#tab-import")?.click();
    }, { once: true });
  });
  await page.reload();
  await page.locator("#app-shell[aria-busy='false']").waitFor();
  assert.equal(await page.locator("#tab-import").getAttribute("aria-current"), "page");
  await page.getByLabel("Texto das questões").waitFor();
});
