import { createBackup, parseBackup } from "../../storage/backup.js";
import {
  openLocalQuizState,
  resumeActionLabel,
  selectMostRecentlyStudiedQuiz
} from "../library-session.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
}

function progressLabel(quiz) {
  const total = quiz.questions.length;
  const answered = Number(quiz.progress?.answered || 0);
  return `${Math.min(Math.max(answered, 0), total)}/${total} respondidas`;
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
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

function downloadQuiz(quiz) {
  downloadJson(quiz, `${quiz.title || "simulado"}.json`);
}

function downloadBackup(quizzes) {
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(createBackup(quizzes), `medup-backup-${date}.json`);
}

async function refresh(store, library, patch = {}) {
  store.setState({ ...patch, libraryItems: await library.list() });
}

function reportError(store, error) {
  store.setState({
    notice: {
      type: "error",
      message: error.message || "Não foi possível atualizar a biblioteca local."
    }
  });
}

export function renderLibraryView(container, store, library) {
  const { libraryItems, libraryLoading } = store.getState();
  if (libraryLoading) {
    container.innerHTML = '<div class="glass-card" role="status">Carregando biblioteca...</div>';
    return;
  }

  const resumeQuiz = selectMostRecentlyStudiedQuiz(libraryItems);
  const resumeLabel = resumeQuiz ? resumeActionLabel(resumeQuiz) : "";
  const resume = resumeQuiz ? `
    <article class="glass-card" data-resume-quiz="${escapeHtml(resumeQuiz.id)}" style="margin-bottom:20px">
      <p class="question-kicker">${resumeLabel}</p>
      <div style="display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap">
        <div><h3>${escapeHtml(resumeQuiz.title)}</h3><p>${escapeHtml(progressLabel(resumeQuiz))}</p></div>
        <button class="btn btn-primary" type="button" data-library-action="continue" data-quiz-id="${escapeHtml(resumeQuiz.id)}">${resumeLabel}</button>
      </div>
    </article>` : "";

  const items = libraryItems.map(quiz => `
    <article class="glass-card" data-library-quiz="${escapeHtml(quiz.title)}">
      <div style="display:flex;gap:16px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap">
        <div>
          <h3>${escapeHtml(quiz.title)}</h3>
          <p>${escapeHtml(quiz.sourceName || "Criado localmente")}</p>
          <p>${quiz.questions.length} questões · ${escapeHtml(progressLabel(quiz))} · Atualizado em ${escapeHtml(updateLabel(quiz.updatedAt))}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" type="button" data-library-action="open" data-quiz-id="${escapeHtml(quiz.id)}">Abrir</button>
          <button class="btn btn-secondary" type="button" data-library-action="edit" data-quiz-id="${escapeHtml(quiz.id)}">Editar</button>
          <button class="btn btn-secondary" type="button" data-library-action="rename" data-quiz-id="${escapeHtml(quiz.id)}">Renomear</button>
          <button class="btn btn-secondary" type="button" data-library-action="duplicate" data-quiz-id="${escapeHtml(quiz.id)}">Duplicar</button>
          <button class="btn btn-secondary" type="button" data-library-action="export" data-quiz-id="${escapeHtml(quiz.id)}">Exportar</button>
          <button class="btn btn-danger" type="button" data-library-action="delete" data-quiz-id="${escapeHtml(quiz.id)}">Excluir</button>
        </div>
      </div>
    </article>
  `).join("");

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">
      <div><h2>Seus simulados</h2><p>Simulados salvos neste navegador.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" type="button" id="library-download-backup">Baixar backup</button>
        <button class="btn btn-secondary" type="button" id="library-restore-backup">Restaurar backup</button>
        <button class="btn btn-primary" type="button" id="library-import">Importar questões</button>
      </div>
      <input id="library-restore-file" type="file" accept=".json,application/json" hidden>
    </div>
    ${resume}
    ${items || '<div class="glass-card"><h3>Nenhum simulado salvo</h3><p>Importe questões para criar sua biblioteca local.</p></div>'}
    <dialog id="library-delete-dialog" style="padding:24px;border:0;border-radius:8px;max-width:440px;width:calc(100% - 32px)">
      <h3 id="library-delete-title"></h3>
      <p style="margin:12px 0 20px">Esta ação remove o simulado apenas deste navegador.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary" type="button" data-dialog-cancel>Cancelar</button>
        <button class="btn btn-danger" type="button" data-dialog-confirm>Excluir</button>
      </div>
    </dialog>
    <dialog id="library-restore-dialog" aria-labelledby="library-restore-title" style="padding:24px;border:0;border-radius:8px;max-width:520px;width:calc(100% - 32px)">
      <h3 id="library-restore-title">Restaurar backup</h3>
      <p id="library-restore-preview" style="margin:12px 0 20px"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" type="button" data-restore-cancel>Cancelar</button>
        <button class="btn btn-secondary" type="button" data-restore-mode="preserve">Preservar existentes</button>
        <button class="btn btn-primary" type="button" data-restore-mode="replace">Substituir conflitos</button>
      </div>
    </dialog>`;

  container.querySelector("#library-import").addEventListener("click", () => {
    store.setState({ route: "import", notice: null });
  });

  container.querySelector("#library-download-backup").addEventListener("click", () => {
    try {
      downloadBackup(libraryItems);
    } catch (error) {
      reportError(store, error);
    }
  });

  const restoreInput = container.querySelector("#library-restore-file");
  const restoreDialog = container.querySelector("#library-restore-dialog");
  let pendingRestore = null;
  container.querySelector("#library-restore-backup").addEventListener("click", () => {
    restoreInput.click();
  });
  restoreInput.addEventListener("change", async () => {
    const [file] = restoreInput.files;
    restoreInput.value = "";
    if (!file) return;
    try {
      pendingRestore = parseBackup(
        await file.text(),
        libraryItems.map(quiz => quiz.id)
      );
      const incoming = pendingRestore.preview.incomingCount;
      const conflicts = pendingRestore.preview.conflictingIds.length;
      restoreDialog.querySelector("#library-restore-preview").textContent =
        `${incoming} ${incoming === 1 ? "simulado" : "simulados"} no backup; ` +
        `${conflicts} ${conflicts === 1 ? "conflito" : "conflitos"} com a biblioteca atual.`;
      restoreDialog.showModal();
    } catch (error) {
      pendingRestore = null;
      reportError(store, error);
    }
  });
  restoreDialog.querySelector("[data-restore-cancel]").addEventListener("click", () => {
    pendingRestore = null;
    restoreDialog.close();
  });
  for (const button of restoreDialog.querySelectorAll("[data-restore-mode]")) {
    button.addEventListener("click", async () => {
      if (!pendingRestore) return;
      const restore = pendingRestore;
      pendingRestore = null;
      restoreDialog.close();
      try {
        const result = await library.restore(restore.quizzes, button.dataset.restoreMode);
        const libraryItems = await library.list();
        const activeId = store.getState().activeQuiz?.id;
        const restoredActive = activeId && restore.quizzes.some(quiz => quiz.id === activeId)
          ? libraryItems.find(quiz => quiz.id === activeId) || null
          : undefined;
        const activePatch = restoredActive === undefined
          ? {}
          : restoredActive
            ? openLocalQuizState(restoredActive)
            : {
                activeQuiz: null,
                answers: {},
                finalized: false,
                selectedQuestion: 0,
                readOnly: false
              };
        store.setState({
          ...activePatch,
          route: "library",
          libraryItems,
          notice: {
            type: "success",
            message: `Backup restaurado: ${result.added} adicionados, ${result.replaced} substituídos e ${result.skipped} preservados.`
          }
        });
      } catch (error) {
        reportError(store, error);
      }
    });
  }

  for (const button of container.querySelectorAll("[data-library-action]")) {
    button.addEventListener("click", async () => {
      const { libraryAction: action, quizId: id } = button.dataset;
      try {
        const quiz = await library.get(id);
        if (!quiz) return;
        if (action === "open" || action === "continue" || action === "edit") {
          store.setState({
            ...openLocalQuizState(quiz),
            route: action === "edit" ? "editor" : "study"
          });
          return;
        }
        if (action === "rename") {
          const title = window.prompt("Novo título do simulado", quiz.title);
          if (title == null) return;
          await library.rename(id, title);
          await refresh(store, library);
          return;
        }
        if (action === "duplicate") {
          await library.duplicate(id);
          await refresh(store, library);
          return;
        }
        if (action === "export") {
          downloadQuiz(quiz);
          return;
        }
        if (action === "delete") {
          const dialog = container.querySelector("#library-delete-dialog");
          dialog.dataset.quizId = id;
          dialog.querySelector("#library-delete-title").textContent = `Excluir “${quiz.title}”?`;
          dialog.showModal();
        }
      } catch (error) {
        reportError(store, error);
      }
    });
  }

  const dialog = container.querySelector("#library-delete-dialog");
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-dialog-confirm]").addEventListener("click", async () => {
    const id = dialog.dataset.quizId;
    dialog.close();
    try {
      await library.remove(id);
      const patch = store.getState().activeQuiz?.id === id ? { activeQuiz: null } : {};
      await refresh(store, library, patch);
    } catch (error) {
      reportError(store, error);
    }
  });
}
