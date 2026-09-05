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

function downloadQuiz(quiz) {
  const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${quiz.title || "simulado"}.json`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
      <div><h2>Biblioteca</h2><p>Simulados salvos neste navegador.</p></div>
      <button class="btn btn-primary" type="button" id="library-import">Importar questões</button>
    </div>
    ${items || '<div class="glass-card"><h3>Nenhum simulado salvo</h3><p>Importe questões para criar sua biblioteca local.</p></div>'}
    <dialog id="library-delete-dialog" style="padding:24px;border:0;border-radius:8px;max-width:440px;width:calc(100% - 32px)">
      <h3 id="library-delete-title"></h3>
      <p style="margin:12px 0 20px">Esta ação remove o simulado apenas deste navegador.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary" type="button" data-dialog-cancel>Cancelar</button>
        <button class="btn btn-danger" type="button" data-dialog-confirm>Excluir</button>
      </div>
    </dialog>`;

  container.querySelector("#library-import").addEventListener("click", () => {
    store.setState({ route: "import", notice: null });
  });

  for (const button of container.querySelectorAll("[data-library-action]")) {
    button.addEventListener("click", async () => {
      const { libraryAction: action, quizId: id } = button.dataset;
      try {
        const quiz = await library.get(id);
        if (!quiz) return;
        if (action === "open" || action === "edit") {
          store.setState({
            activeQuiz: quiz,
            route: action === "edit" ? "editor" : "study",
            selectedQuestion: 0,
            answers: {},
            readOnly: false,
            notice: null
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
