import { createQuestion } from "../../core/quiz-schema.js";
import { validateQuiz } from "../../import/validator.js";

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function listValue(value) {
  return (Array.isArray(value) ? value : []).map(item => (
    typeof item === "string" ? item : JSON.stringify(item)
  )).join(", ");
}

function parseList(value) {
  return String(value || "").split(/[\n,]/).map(item => item.trim()).filter(Boolean);
}

function renumber(questions) {
  return questions.map((question, index) => ({ ...question, number: index + 1 }));
}

function renderOptions(question) {
  return question.options.map(option => `
    <fieldset data-editor-option="${escapeHtml(option.label)}" style="border:1px solid var(--border-muted);padding:16px;margin-bottom:12px;border-radius:8px">
      <legend><strong>Alternativa ${escapeHtml(option.label)}</strong></legend>
      <label class="form-label" for="option-${escapeHtml(option.label)}">Texto</label>
      <input class="form-input" id="option-${escapeHtml(option.label)}" name="option-${escapeHtml(option.label)}" value="${escapeHtml(option.text)}">
      <label class="form-label" for="feedback-${escapeHtml(option.label)}" style="margin-top:12px">Feedback da alternativa ${escapeHtml(option.label)}</label>
      <textarea class="form-textarea" id="feedback-${escapeHtml(option.label)}" name="feedback-${escapeHtml(option.label)}">${escapeHtml(question.feedback[option.label] || "")}</textarea>
      ${question.options.length > 2 ? `<button class="btn btn-secondary" type="button" data-remove-option="${escapeHtml(option.label)}" style="margin-top:8px">Remover alternativa ${escapeHtml(option.label)}</button>` : ""}
    </fieldset>`).join("");
}

function formCandidate(container, quiz, selectedIndex) {
  const form = container.querySelector("#canonical-editor-form");
  const field = name => form.elements.namedItem(name)?.value ?? "";
  const current = quiz.questions[selectedIndex];
  const options = [...container.querySelectorAll("[data-editor-option]")].map(row => {
    const label = row.dataset.editorOption;
    return { label, text: field(`option-${label}`) };
  });
  const feedback = Object.fromEntries(options.map(({ label }) => [
    label,
    field(`feedback-${label}`)
  ]));
  const questions = quiz.questions.map((question, index) => index === selectedIndex ? {
    ...question,
    topic: field("topic"),
    type: field("type"),
    difficulty: field("difficulty"),
    prompt: field("prompt"),
    options,
    correctOption: field("correctOption"),
    feedback,
    takeHome: field("takeHome"),
    keyPoint: field("keyPoint"),
    sourceReference: field("sourceReference")
  } : question);

  return {
    ...quiz,
    title: field("title"),
    sourceName: field("sourceName"),
    introduction: field("introduction"),
    themes: parseList(field("themes")),
    distribution: parseList(field("distribution")),
    questions: renumber(questions)
  };
}

function showValidation(container, validation) {
  const alert = container.querySelector("#editor-validation");
  const blocked = validation.diagnostics.flatMap(diagnostic => (
    diagnostic.status === "blocked"
      ? diagnostic.messages.map(message => `Questão ${diagnostic.questionNumber}: ${message}`)
      : []
  ));
  alert.innerHTML = blocked.map(message => `<li>${escapeHtml(message)}</li>`).join("");
  alert.hidden = blocked.length === 0;
}

function reportStorageError(container, error) {
  const alert = container.querySelector("#editor-validation");
  alert.innerHTML = `<li>${escapeHtml(error.message || "Não foi possível salvar o simulado.")}</li>`;
  alert.hidden = false;
}

export function renderEditorView(container, store, library) {
  const state = store.getState();
  const quiz = state.activeQuiz;
  if (!quiz?.questions.length) {
    container.innerHTML = '<div class="glass-card"><h2>Editor</h2><p>Abra ou importe um simulado para editar.</p></div>';
    return { save: async () => true };
  }

  const selectedIndex = Math.min(state.selectedQuestion, quiz.questions.length - 1);
  const question = quiz.questions[selectedIndex];
  const sidebar = quiz.questions.map((item, index) => `
    <button class="nav-quest-btn${index === selectedIndex ? " active" : ""}" type="button" data-editor-question="${index}">
      Questão ${item.number}
    </button>`).join("");
  const correctOptions = question.options.map(option => `
    <option value="${escapeHtml(option.label)}" ${option.label === question.correctOption ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">
      <div><h2>Editar simulado</h2><p>As alterações válidas são salvas antes de navegar.</p></div>
      <button class="btn btn-primary" type="button" id="save-editor">Salvar alterações</button>
    </div>
    <div class="editor-grid" style="display:grid">
      <aside class="glass-card" style="padding:16px;align-self:start">
        <h3>Questões</h3>
        <div class="editor-sidebar" style="margin:12px 0">${sidebar}</div>
        <button class="btn btn-primary" type="button" id="add-question">Adicionar questão</button>
      </aside>
      <main class="glass-card">
        <form id="canonical-editor-form">
          <h3>Metadados do simulado</h3>
          <div class="form-group"><label class="form-label" for="quiz-title">Título</label><input class="form-input" id="quiz-title" name="title" value="${escapeHtml(quiz.title)}"></div>
          <div class="form-group"><label class="form-label" for="quiz-source">Fonte</label><input class="form-input" id="quiz-source" name="sourceName" value="${escapeHtml(quiz.sourceName)}"></div>
          <div class="form-group"><label class="form-label" for="quiz-introduction">Introdução</label><textarea class="form-textarea" id="quiz-introduction" name="introduction">${escapeHtml(quiz.introduction)}</textarea></div>
          <div class="form-group"><label class="form-label" for="quiz-themes">Temas</label><input class="form-input" id="quiz-themes" name="themes" value="${escapeHtml(listValue(quiz.themes))}"></div>
          <div class="form-group"><label class="form-label" for="quiz-distribution">Distribuição</label><input class="form-input" id="quiz-distribution" name="distribution" value="${escapeHtml(listValue(quiz.distribution))}"></div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin:24px 0 16px;flex-wrap:wrap">
            <h3>Questão ${question.number}</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-secondary" type="button" id="duplicate-question">Duplicar questão</button>
              <button class="btn btn-secondary" type="button" id="move-question-up" ${selectedIndex === 0 ? "disabled" : ""}>Mover questão para cima</button>
              <button class="btn btn-secondary" type="button" id="move-question-down" ${selectedIndex === quiz.questions.length - 1 ? "disabled" : ""}>Mover questão para baixo</button>
              <button class="btn btn-danger" type="button" id="delete-question" ${quiz.questions.length === 1 ? "disabled" : ""}>Excluir questão</button>
            </div>
          </div>
          <ul id="editor-validation" role="alert" hidden style="margin-bottom:16px;color:var(--error)"></ul>
          <div class="form-group"><label class="form-label" for="question-topic">Tema</label><input class="form-input" id="question-topic" name="topic" value="${escapeHtml(question.topic)}"></div>
          <div class="form-group"><label class="form-label" for="question-type">Tipo</label><input class="form-input" id="question-type" name="type" value="${escapeHtml(question.type)}"></div>
          <div class="form-group"><label class="form-label" for="question-difficulty">Dificuldade</label><input class="form-input" id="question-difficulty" name="difficulty" value="${escapeHtml(question.difficulty)}"></div>
          <div class="form-group"><label class="form-label" for="question-prompt">Enunciado da questão</label><textarea class="form-textarea" id="question-prompt" name="prompt">${escapeHtml(question.prompt)}</textarea></div>
          <div class="form-group">
            <label class="form-label" for="question-correct">Resposta correta</label>
            <select class="form-input" id="question-correct" name="correctOption"><option value="">Selecione</option>${correctOptions}</select>
          </div>
          <h3 style="margin:20px 0 12px">Alternativas e feedback</h3>
          <div id="editor-options">${renderOptions(question)}</div>
          <button class="btn btn-secondary" type="button" id="add-option" ${question.options.length >= 5 ? "disabled" : ""}>Adicionar alternativa</button>
          <div class="form-group"><label class="form-label" for="question-take-home">Take-home message</label><textarea class="form-textarea" id="question-take-home" name="takeHome">${escapeHtml(question.takeHome)}</textarea></div>
          <div class="form-group"><label class="form-label" for="question-key-point">Ponto-chave</label><textarea class="form-textarea" id="question-key-point" name="keyPoint">${escapeHtml(question.keyPoint)}</textarea></div>
          <div class="form-group"><label class="form-label" for="question-source-reference">Fonte no material</label><textarea class="form-textarea" id="question-source-reference" name="sourceReference">${escapeHtml(question.sourceReference)}</textarea></div>
        </form>
      </main>
    </div>
    <dialog id="editor-delete-dialog" style="padding:24px;border:0;border-radius:8px;max-width:440px;width:calc(100% - 32px)">
      <h3>Excluir Questão ${question.number}?</h3>
      <p style="margin:12px 0 20px">A questão será removida deste simulado.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary" type="button" data-dialog-cancel>Cancelar</button>
        <button class="btn btn-danger" type="button" data-dialog-confirm>Excluir</button>
      </div>
    </dialog>`;

  const persist = async (candidate, publish = true) => {
    const validation = validateQuiz(candidate);
    showValidation(container, validation);
    if (validation.status === "blocked") return null;
    const saved = {
      ...validation.quiz,
      ...(candidate.progress ? { progress: candidate.progress } : {}),
      updatedAt: new Date().toISOString()
    };
    try {
      await library.put(saved);
      const libraryItems = await library.list();
      if (publish) store.setState({ activeQuiz: saved, libraryItems, notice: null });
      return { saved, libraryItems };
    } catch (error) {
      reportStorageError(container, error);
      return null;
    }
  };

  const save = async (publish = true) => persist(
    formCandidate(container, store.getState().activeQuiz, selectedIndex),
    publish
  );

  container.querySelector("#save-editor").addEventListener("click", () => void save());
  for (const button of container.querySelectorAll("[data-editor-question]")) {
    button.addEventListener("click", async () => {
      const result = await save(false);
      if (!result) return;
      store.setState({
        activeQuiz: result.saved,
        libraryItems: result.libraryItems,
        selectedQuestion: Number(button.dataset.editorQuestion),
        notice: null
      });
    });
  }

  container.querySelector("#add-question").addEventListener("click", async () => {
    const result = await save(false);
    if (!result) return;
    const questions = [...result.saved.questions, createQuestion({
      id: crypto.randomUUID(),
      number: result.saved.questions.length + 1,
      options: { A: "", B: "" }
    }, result.saved.questions.length)];
    store.setState({
      activeQuiz: { ...result.saved, questions },
      libraryItems: result.libraryItems,
      selectedQuestion: questions.length - 1
    });
  });

  container.querySelector("#duplicate-question").addEventListener("click", async () => {
    const result = await save(false);
    if (!result) return;
    const copy = structuredClone(result.saved.questions[selectedIndex]);
    copy.id = crypto.randomUUID();
    const questions = [...result.saved.questions];
    questions.splice(selectedIndex + 1, 0, copy);
    const persisted = await persist({ ...result.saved, questions: renumber(questions) }, false);
    if (!persisted) return;
    store.setState({
      activeQuiz: persisted.saved,
      libraryItems: persisted.libraryItems,
      selectedQuestion: selectedIndex + 1
    });
  });

  const move = async offset => {
    const result = await save(false);
    if (!result) return;
    const target = selectedIndex + offset;
    if (target < 0 || target >= result.saved.questions.length) return;
    const questions = [...result.saved.questions];
    [questions[selectedIndex], questions[target]] = [questions[target], questions[selectedIndex]];
    const persisted = await persist({ ...result.saved, questions: renumber(questions) }, false);
    if (!persisted) return;
    store.setState({
      activeQuiz: persisted.saved,
      libraryItems: persisted.libraryItems,
      selectedQuestion: target
    });
  };
  container.querySelector("#move-question-up").addEventListener("click", () => void move(-1));
  container.querySelector("#move-question-down").addEventListener("click", () => void move(1));

  const dialog = container.querySelector("#editor-delete-dialog");
  container.querySelector("#delete-question").addEventListener("click", async () => {
    const result = await save(false);
    if (!result) return;
    dialog.dataset.savedQuiz = JSON.stringify(result.saved);
    dialog.showModal();
  });
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-dialog-confirm]").addEventListener("click", async () => {
    const saved = JSON.parse(dialog.dataset.savedQuiz);
    dialog.close();
    const questions = saved.questions.filter((_, index) => index !== selectedIndex);
    const persisted = await persist({ ...saved, questions: renumber(questions) }, false);
    if (!persisted) return;
    store.setState({
      activeQuiz: persisted.saved,
      libraryItems: persisted.libraryItems,
      selectedQuestion: Math.min(selectedIndex, questions.length - 1)
    });
  });

  container.querySelector("#add-option").addEventListener("click", () => {
    const candidate = formCandidate(container, quiz, selectedIndex);
    const nextLabel = OPTION_LABELS.find(label => (
      !candidate.questions[selectedIndex].options.some(option => option.label === label)
    ));
    if (!nextLabel) return;
    const current = candidate.questions[selectedIndex];
    current.options.push({ label: nextLabel, text: "" });
    current.feedback[nextLabel] = "";
    store.setState({ activeQuiz: candidate });
  });
  for (const button of container.querySelectorAll("[data-remove-option]")) {
    button.addEventListener("click", () => {
      const candidate = formCandidate(container, quiz, selectedIndex);
      const label = button.dataset.removeOption;
      const current = candidate.questions[selectedIndex];
      current.options = current.options.filter(option => option.label !== label);
      delete current.feedback[label];
      if (current.correctOption === label) current.correctOption = "";
      store.setState({ activeQuiz: candidate });
    });
  }

  return { save: () => save(true).then(Boolean) };
}
