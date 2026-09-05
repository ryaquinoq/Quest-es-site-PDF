import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { chromium } from "playwright";
import { PROMPT_SUPREMO } from "../../js/prompt-supremo.js";

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

test("Prompt Supremo can be read, copied, downloaded, and closed with focus return", async t => {
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
  const context = await browser.newContext({ acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  await page.goto(`${baseUrl}/`);

  const trigger = page.getByRole("button", { name: "Abrir Prompt Supremo" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Prompt Supremo MedUp" });
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /REGRA ABSOLUTA DE FIDELIDADE ÀS FONTES/);

  await dialog.getByRole("button", { name: "Copiar prompt" }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboard.replaceAll("\r\n", "\n"), PROMPT_SUPREMO);
  await dialog.getByText("Prompt copiado.", { exact: true }).waitFor();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Baixar .md" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "PROMPT-SUPREMO-MEDUP.md");

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
});
