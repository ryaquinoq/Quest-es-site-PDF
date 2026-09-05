import { extractPdf } from "../../import/pdf.js";
import { importQuiz } from "../../import/pipeline.js";

const ACCEPTED_EXTENSIONS = new Set(["pdf", "txt", "md", "json"]);
const STATUS_LABELS = {
  ready: "Ready",
  attention: "Attention",
  blocked: "Blocked"
};
const fileLoaders = new WeakMap();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateDraft(store, patch) {
  store.setState(state => ({
    importDraft: { ...state.importDraft, ...patch }
  }));
}

function questionId(result, index) {
  return result.quiz.questions[index]?.id || `diagnostic-${index + 1}`;
}

function renderReview(result, excludedQuestionIds) {
  if (!result) return "";

  const confidence = Math.round((Number(result.confidence) || 0) * 100);
  const rows = result.diagnostics.map((diagnostic, index) => {
    const id = questionId(result, index);
    const number = diagnostic.questionNumber || index + 1;
    const checked = excludedQuestionIds.includes(id);
    const messages = diagnostic.messages.length
      ? diagnostic.messages.map(message => `<li>${escapeHtml(message)}</li>`).join("")
      : "<li>Nenhum problema encontrado.</li>";

    return `
      <tr data-status="${escapeHtml(diagnostic.status)}">
        <th scope="row">Questão ${number}</th>
        <td><strong>${STATUS_LABELS[diagnostic.status] || diagnostic.status}</strong></td>
        <td><ul>${messages}</ul></td>
        <td>
          <label>
            <input
              type="checkbox"
              data-exclude-question="${escapeHtml(id)}"
              aria-label="Excluir questão ${number}"
              ${checked ? "checked" : ""}
            >
            Excluir
          </label>
        </td>
      </tr>`;
  }).join("");
  const hasIncludedBlocked = result.diagnostics.some((diagnostic, index) => (
    diagnostic.status === "blocked" &&
    !excludedQuestionIds.includes(questionId(result, index))
  ));
  const includedCount = result.quiz.questions.filter((_, index) => (
    !excludedQuestionIds.includes(questionId(result, index))
  )).length;

  return `
    <section class="glass-card" aria-labelledby="import-review-title">
      <h3 id="import-review-title">Revisão da importação</h3>
      <p>
        Formato detectado: <strong>${escapeHtml(result.detectedFormat)}</strong>
        · Confiança: <strong>${confidence}%</strong>
      </p>
      <div style="overflow-x: auto; margin-top: 16px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr><th>Item</th><th>Status</th><th>Diagnóstico</th><th>Ação</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <button
        class="btn btn-primary"
        id="confirm-import"
        style="margin-top: 16px;"
        ${hasIncludedBlocked || includedCount === 0 ? "disabled" : ""}
      >Confirmar importação</button>
      ${hasIncludedBlocked ? "<p>Exclua ou corrija as questões bloqueadas para continuar.</p>" : ""}
    </section>`;
}

async function readSourceFile(file, onProgress) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    throw new Error("Use um arquivo PDF, TXT, MD ou JSON.");
  }

  if (extension === "pdf") {
    const result = await extractPdf(file, onProgress);
    return { sourceName: file.name, sourceText: result.text };
  }

  return { sourceName: file.name, sourceText: await file.text() };
}

export function createLatestFileLoader(store, readSource = readSourceFile) {
  let generation = 0;

  return async function loadFile(file) {
    if (!file) return false;
    const currentGeneration = ++generation;
    store.setState(state => ({
      importResult: null,
      notice: null,
      importDraft: {
        ...state.importDraft,
        sourceName: file.name,
        excludedQuestionIds: [],
        loading: true,
        progress: null,
        error: ""
      }
    }));

    try {
      const source = await readSource(file, (current, total) => {
        if (currentGeneration === generation) {
          updateDraft(store, { progress: { current, total } });
        }
      });
      if (currentGeneration !== generation) return false;
      updateDraft(store, {
        sourceName: source.sourceName,
        sourceText: source.sourceText
      });
      return true;
    } catch (error) {
      if (currentGeneration !== generation) return false;
      updateDraft(store, { error: error.message });
      return false;
    } finally {
      if (currentGeneration === generation) updateDraft(store, { loading: false });
    }
  };
}

function fileLoaderFor(store) {
  if (!fileLoaders.has(store)) {
    fileLoaders.set(store, createLatestFileLoader(store));
  }
  return fileLoaders.get(store);
}

function analyzeSource(store, sourceText) {
  updateDraft(store, {
    sourceText,
    excludedQuestionIds: [],
    error: ""
  });

  if (!sourceText.trim()) {
    store.setState({ importResult: null });
    updateDraft(store, { error: "Cole o texto ou selecione um arquivo antes de analisar." });
    return;
  }

  try {
    store.setState({
      importResult: importQuiz(sourceText),
      notice: null
    });
  } catch (error) {
    updateDraft(store, {
      error: `Não foi possível analisar o conteúdo: ${error.message}`
    });
    store.setState({ importResult: null });
  }
}

async function confirmImport(store, library) {
  const state = store.getState();
  const { importResult, importDraft } = state;
  if (!importResult) return;

  const includedQuestions = importResult.quiz.questions.filter((_, index) => (
    !importDraft.excludedQuestionIds.includes(questionId(importResult, index))
  ));
  const hasIncludedBlocked = importResult.diagnostics.some((diagnostic, index) => (
    diagnostic.status === "blocked" &&
    !importDraft.excludedQuestionIds.includes(questionId(importResult, index))
  ));

  if (hasIncludedBlocked || includedQuestions.length === 0) return;

  const activeQuiz = {
    ...importResult.quiz,
    sourceName: importDraft.sourceName || importResult.quiz.sourceName,
    updatedAt: new Date().toISOString(),
    questions: includedQuestions
  };

  try {
    if (library) await library.put(activeQuiz);
    const libraryItems = library ? await library.list() : state.libraryItems;
    store.setState({
      route: "study",
      activeQuiz,
      libraryItems,
      selectedQuestion: 0,
      answers: {},
      finalized: false,
      readOnly: false,
      notice: {
        type: "success",
        message: `${includedQuestions.length} questão carregada para estudo.`
      }
    });
  } catch (error) {
    store.setState({
      notice: {
        type: "error",
        message: error.message || "Não foi possível salvar o simulado na biblioteca local."
      }
    });
  }
}

export function renderImportView(container, store, library) {
  const { importDraft, importResult } = store.getState();
  const progress = importDraft.progress;

  container.innerHTML = `
    <div class="glass-card">
      <h2>Importar questões</h2>
      <p>O conteúdo é processado localmente neste navegador.</p>
      <div class="dropzone-container" style="margin-top: 20px;">
        <div class="upload-box" id="dropzone" tabindex="0" role="button">
          <input
            type="file"
            id="file-input"
            accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown,application/json"
            hidden
          >
          <h3>Selecionar arquivo</h3>
          <p>PDF, TXT, Markdown ou MedUp JSON</p>
          ${importDraft.sourceName ? `<p><strong>${escapeHtml(importDraft.sourceName)}</strong></p>` : ""}
        </div>
        <div class="paste-box">
          <label class="form-label" for="paste-area">Texto das questões</label>
          <textarea
            class="textarea-input"
            id="paste-area"
            placeholder="Cole aqui as questões estruturadas"
          >${escapeHtml(importDraft.sourceText)}</textarea>
          <button class="btn btn-primary" id="analyze-import" ${importDraft.loading ? "disabled" : ""}>
            Analisar questões
          </button>
        </div>
      </div>
      ${importDraft.loading ? `
        <div role="status" style="margin-top: 16px;">
          ${progress ? `Lendo página ${progress.current} de ${progress.total}` : "Lendo arquivo..."}
        </div>` : ""}
      ${importDraft.error ? `<p role="alert">${escapeHtml(importDraft.error)}</p>` : ""}
    </div>
    ${renderReview(importResult, importDraft.excludedQuestionIds)}
  `;

  const fileInput = container.querySelector("#file-input");
  const dropzone = container.querySelector("#dropzone");
  const chooseFile = fileLoaderFor(store);

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") fileInput.click();
  });
  dropzone.addEventListener("dragover", event => event.preventDefault());
  dropzone.addEventListener("drop", event => {
    event.preventDefault();
    void chooseFile(event.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => void chooseFile(fileInput.files[0]));
  container.querySelector("#analyze-import").addEventListener("click", () => {
    analyzeSource(store, container.querySelector("#paste-area").value);
  });

  for (const checkbox of container.querySelectorAll("[data-exclude-question]")) {
    checkbox.addEventListener("change", () => {
      const excluded = new Set(store.getState().importDraft.excludedQuestionIds);
      if (checkbox.checked) excluded.add(checkbox.dataset.excludeQuestion);
      else excluded.delete(checkbox.dataset.excludeQuestion);
      updateDraft(store, { excludedQuestionIds: [...excluded] });
    });
  }

  container.querySelector("#confirm-import")?.addEventListener("click", () => {
    void confirmImport(store, library);
  });
}
