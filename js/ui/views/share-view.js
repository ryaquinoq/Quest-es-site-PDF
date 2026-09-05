import { getShareDecision } from "../../share/codec.js";
import { generateStandaloneHtml } from "../../share/standalone.js";
import { escapeHtml } from "./study-view.js";

function fileStem(title) {
  const normalized = String(title || "simulado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return normalized || "simulado";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function htmlFile(quiz) {
  return new File(
    [generateStandaloneHtml(quiz)],
    `${fileStem(quiz.title)}.html`,
    { type: "text/html;charset=utf-8" }
  );
}

function supportsFileShare(file) {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function renderShareView(container, store) {
  const quiz = store.getState().activeQuiz;
  if (!quiz) {
    container.innerHTML = `
      <div class="glass-card no-data-state">
        <h2>Nenhum simulado para compartilhar</h2>
        <p>Importe questões antes de gerar os arquivos.</p>
      </div>`;
    return;
  }

  container.innerHTML = '<p role="status">Preparando opções de compartilhamento...</p>';
  const decision = await getShareDecision(quiz, window.location.href);
  const file = htmlFile(quiz);
  const canShareFile = supportsFileShare(file);
  const fallback = decision.mode === "html";

  container.innerHTML = `
    <section class="glass-card" aria-labelledby="share-title">
      <h2 id="share-title">Compartilhar ${escapeHtml(quiz.title)}</h2>
      <p>Escolha um formato para enviar ou guardar este simulado.</p>
      <div class="export-card-grid" style="margin-top: 20px;">
        <div class="export-tile">
          <h3>Link de estudo</h3>
          <p>Abre uma cópia somente para estudo no navegador.</p>
          <button class="btn btn-primary" type="button" id="copy-share-link" ${fallback ? "disabled" : ""}>
            Copiar link
          </button>
          <p id="share-policy-message">${fallback ? escapeHtml(decision.message) : ""}</p>
        </div>
        <div class="export-tile">
          <h3>Arquivo offline</h3>
          <p>Inclui questões, respostas e revisão em um único HTML.</p>
          <button class="btn btn-primary" type="button" id="download-share-html">Baixar HTML</button>
          ${canShareFile ? '<button class="btn" type="button" id="native-share-html">Compartilhar HTML</button>' : ""}
        </div>
        <div class="export-tile">
          <h3>Dados estruturados</h3>
          <p>Guarda o conteúdo canônico para backup ou nova importação.</p>
          <button class="btn btn-primary" type="button" id="download-share-json">Baixar JSON</button>
        </div>
      </div>
      <p id="share-status" role="status" aria-live="polite"></p>
    </section>`;

  const status = container.querySelector("#share-status");
  container.querySelector("#copy-share-link")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(decision.url);
      status.textContent = "Link copiado.";
    } catch {
      status.textContent = "Não foi possível copiar o link neste navegador.";
    }
  });
  container.querySelector("#download-share-html").addEventListener("click", () => {
    downloadBlob(file, file.name);
    status.textContent = "HTML preparado para download.";
  });
  container.querySelector("#download-share-json").addEventListener("click", () => {
    downloadBlob(
      new Blob([JSON.stringify(quiz, null, 2)], { type: "application/json;charset=utf-8" }),
      `${fileStem(quiz.title)}.json`
    );
    status.textContent = "JSON preparado para download.";
  });
  container.querySelector("#native-share-html")?.addEventListener("click", async () => {
    try {
      await navigator.share({ files: [file], title: quiz.title });
      status.textContent = "HTML compartilhado.";
    } catch (error) {
      if (error?.name !== "AbortError") {
        status.textContent = "Não foi possível compartilhar o HTML neste navegador.";
      }
    }
  });
}
