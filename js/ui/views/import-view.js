import { extractPdf } from "../../import/pdf.js";
import { importQuiz } from "../../import/pipeline.js";
import { validateQuiz } from "../../import/validator.js";
import { PROMPT_SUPREMO } from "../../prompt-supremo.js";

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

function downloadPrompt() {
  const content = `# Prompt Supremo MedUp\n\n\`\`\`text\n${PROMPT_SUPREMO}\n\`\`\`\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "PROMPT-SUPREMO-MEDUP.md";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function questionId(result, index) {
  return result.quiz.questions[index]?.id || `diagnostic-${index + 1}`;
}

function renderQuestionEditor(result, index) {
  const question = result.quiz.questions[index];
  if (!question) return "";
  return `<div class="import-question-editor" data-import-question-editor="${index}">
    <div class="import-editor-grid">
      <label class="form-group"><span class="form-label">Tema</span><input class="form-input" data-question-field="topic" value="${escapeHtml(question.topic)}"></label>
      <label class="form-group"><span class="form-label">Dificuldade</span><input class="form-input" data-question-field="difficulty" value="${escapeHtml(question.difficulty)}"></label>
    </div>
    <label class="form-group"><span class="form-label">Enunciado</span><textarea class="form-textarea" data-question-field="prompt">${escapeHtml(question.prompt)}</textarea></label>
    <fieldset class="import-options-editor"><legend>Alternativas, gabarito e justificativas</legend>
      ${question.options.map((option, optionIndex) => `<div class="import-option-editor">
        <label class="correct-choice"><input type="radio" name="correct-option-${index}" data-correct-option value="${escapeHtml(option.label)}" ${option.label === question.correctOption ? "checked" : ""}><span>${escapeHtml(option.label)}</span><small>Correta</small></label>
        <label><span class="form-label">Texto da alternativa ${escapeHtml(option.label)}</span><textarea class="form-textarea" data-option-index="${optionIndex}" data-option-field="text">${escapeHtml(option.text)}</textarea></label>
        <label><span class="form-label">Justificativa ${escapeHtml(option.label)}</span><textarea class="form-textarea" data-option-index="${optionIndex}" data-option-field="feedback">${escapeHtml(question.feedback?.[option.label] || "")}</textarea></label>
      </div>`).join("")}
    </fieldset>
    <label class="form-group"><span class="form-label">Para levar</span><textarea class="form-textarea" data-question-field="takeHome">${escapeHtml(question.takeHome)}</textarea></label>
    <p class="import-edit-hint">As alterações são revalidadas automaticamente ao sair de cada campo.</p>
  </div>`;
}

function renderReview(result, importDraft) {
  if (!result) return "";

  const excludedQuestionIds = importDraft.excludedQuestionIds;
  const editingIndex = Number.isInteger(importDraft.editingQuestionIndex)
    ? importDraft.editingQuestionIndex
    : -1;

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
          <div class="import-row-actions"><button class="btn btn-secondary" type="button" data-edit-import-question="${index}">${editingIndex === index ? "Fechar" : "Corrigir"}</button><label>
            <input
              type="checkbox"
              data-exclude-question="${escapeHtml(id)}"
              aria-label="Excluir questão ${number}"
              ${checked ? "checked" : ""}
            >
            Excluir
          </label></div>
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
      ${editingIndex >= 0 ? renderQuestionEditor(result, editingIndex) : ""}
      <button
        class="btn btn-primary"
        id="confirm-import"
        style="margin-top: 16px;"
        ${hasIncludedBlocked || includedCount === 0 ? "disabled" : ""}
      >Confirmar importação</button>
      ${hasIncludedBlocked ? "<p>Exclua ou corrija as questões bloqueadas para continuar.</p>" : ""}
    </section>`;
}

function updateImportedQuestion(store, index, updater) {
  const state = store.getState();
  if (!state.importResult?.quiz.questions[index]) return;
  const questions = state.importResult.quiz.questions.map((question, questionIndex) => {
    if (questionIndex !== index) return question;
    const copy = {
      ...question,
      options: question.options.map(option => ({ ...option })),
      feedback: { ...question.feedback }
    };
    updater(copy);
    return copy;
  });
  const checked = validateQuiz({ ...state.importResult.quiz, questions });
  store.setState({
    importResult: {
      ...state.importResult,
      ...checked
    }
  });
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
    <div class="glass-card import-panel">
    <div class="import-intro">
      <div><p class="section-kicker">Fluxo NotebookLM + Google Docs</p><h2>Transforme material médico em estudo ativo</h2>
      <p>Importe PDF, texto, Markdown ou JSON. Todo o processamento acontece localmente.</p></div>
      <button class="btn btn-secondary" type="button" id="open-prompt">Abrir Prompt Supremo</button>
    </div>
      <div class="dropzone-container" style="margin-top: 20px;">
        <div class="upload-box" id="dropzone" tabindex="0" role="button">
          <input
            type="file"
            id="file-input"
            accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown,application/json"
            hidden
          >
          <span class="upload-emblem" aria-hidden="true">↥</span>
          <h3>Selecionar arquivo</h3>
          <p>PDF, TXT, Markdown ou MedUp JSON</p>
          <span class="btn btn-primary upload-cta" aria-hidden="true">Escolher arquivo</span>
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
    <div class="benefits-strip" aria-label="Recursos MedUp">
      <div><span class="benefit-symbol" aria-hidden="true">◇</span><strong>Processamento local<small>Sua privacidade em primeiro lugar</small></strong></div>
      <div><span class="benefit-symbol" aria-hidden="true">▤</span><strong>Múltiplos formatos<small>PDF, TXT, Markdown e JSON</small></strong></div>
      <div><span class="benefit-symbol" aria-hidden="true">▱</span><strong>Organização automática<small>Questões prontas para revisar</small></strong></div>
      <div><span class="benefit-symbol" aria-hidden="true">▥</span><strong>Estudo mais eficiente<small>Do material à performance</small></strong></div>
    </div>
    ${renderReview(importResult, importDraft)}
    <dialog class="prompt-dialog" id="prompt-dialog" aria-labelledby="prompt-dialog-title">
      <div class="dialog-header"><div><p class="section-kicker">NotebookLM</p><h2 id="prompt-dialog-title">Prompt Supremo MedUp</h2></div><button class="icon-button" type="button" data-close-prompt aria-label="Fechar">×</button></div>
      <pre class="prompt-content">${escapeHtml(PROMPT_SUPREMO)}</pre>
      <div class="dialog-actions"><span id="prompt-status" role="status" aria-live="polite"></span><button class="btn btn-secondary" type="button" id="download-prompt">Baixar .md</button><button class="btn btn-primary" type="button" id="copy-prompt">Copiar prompt</button></div>
    </dialog>
  `;

  const fileInput = container.querySelector("#file-input");
  const dropzone = container.querySelector("#dropzone");
  const chooseFile = fileLoaderFor(store);
  const promptTrigger = container.querySelector("#open-prompt");
  const promptDialog = container.querySelector("#prompt-dialog");

  promptTrigger.addEventListener("click", () => promptDialog.showModal());
  promptDialog.querySelector("[data-close-prompt]").addEventListener("click", () => promptDialog.close());
  promptDialog.addEventListener("close", () => promptTrigger.focus());
  promptDialog.querySelector("#copy-prompt").addEventListener("click", async () => {
    await navigator.clipboard.writeText(PROMPT_SUPREMO);
    promptDialog.querySelector("#prompt-status").textContent = "Prompt copiado.";
  });
  promptDialog.querySelector("#download-prompt").addEventListener("click", downloadPrompt);

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

  for (const button of container.querySelectorAll("[data-edit-import-question]")) {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.editImportQuestion);
      updateDraft(store, {
        editingQuestionIndex: store.getState().importDraft.editingQuestionIndex === index ? null : index
      });
    });
  }

  const editor = container.querySelector("[data-import-question-editor]");
  if (editor) {
    const questionIndex = Number(editor.dataset.importQuestionEditor);
    for (const field of editor.querySelectorAll("[data-question-field]")) {
      field.addEventListener("change", () => updateImportedQuestion(store, questionIndex, question => {
        question[field.dataset.questionField] = field.value;
      }));
    }
    for (const field of editor.querySelectorAll("[data-option-field]")) {
      field.addEventListener("change", () => updateImportedQuestion(store, questionIndex, question => {
        const option = question.options[Number(field.dataset.optionIndex)];
        if (field.dataset.optionField === "text") option.text = field.value;
        else question.feedback[option.label] = field.value;
      }));
    }
    for (const radio of editor.querySelectorAll("[data-correct-option]")) {
      radio.addEventListener("change", () => updateImportedQuestion(store, questionIndex, question => {
        question.correctOption = radio.value;
      }));
    }
  }

  container.querySelector("#confirm-import")?.addEventListener("click", () => {
    void confirmImport(store, library);
  });
}
