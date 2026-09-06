export function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

const keyboardStores = new WeakSet();

function optionMarkup(question, answers, finalized) {
  const selected = answers[question.id];
  return question.options.map(option => {
    const chosen = selected === option.label;
    const correct = option.label === question.correctOption;
    const stateClass = selected || finalized ? (correct ? " is-correct" : chosen ? " is-incorrect" : "") : "";
    const showFeedback = selected || finalized;
    const feedback = `<span class="option-feedback" data-option-feedback="${escapeHtml(option.label)}" ${showFeedback ? "" : "hidden"}><strong>${correct ? "Correta" : "Incorreta"}:</strong> ${escapeHtml(question.feedback?.[option.label] || "Justificativa não informada no documento.")}</span>`;
    return `<button class="option-item${stateClass}" type="button" data-option="${escapeHtml(option.label)}" aria-label="Alternativa ${escapeHtml(option.label)}: ${escapeHtml(option.text)}" aria-pressed="${chosen}">
      <span class="option-letter">${escapeHtml(option.label)}</span>
      <span class="option-copy"><span>Alternativa ${escapeHtml(option.label)}: ${escapeHtml(option.text)}</span>${feedback}</span>
    </button>`;
  }).join("");
}

export function renderStudyQuestionMarkup(question, index, options = {}) {
  const answers = options.answers || {};
  return `<article class="question-paper" data-study-question="${escapeHtml(question.id)}" data-question-index="${index}" ${options.hidden ? "hidden" : ""}>
    <div class="question-meta"><span>${escapeHtml(question.topic)}</span><span>${escapeHtml(question.difficulty)}</span></div>
    <h2>Questão ${escapeHtml(question.number)}</h2>
    <p class="question-prompt">${escapeHtml(question.prompt)}</p>
    <div class="options-list">${optionMarkup(question, answers, options.finalized)}</div>
    <aside class="take-home" data-take-home ${answers[question.id] || options.finalized ? "" : "hidden"}><strong>Para levar:</strong><p>${escapeHtml(question.takeHome || question.keyPoint || "")}</p></aside>
  </article>`;
}

function progressFor(quiz, state) {
  const answers = { ...state.answers };
  const answered = Object.keys(answers).length;
  const correct = quiz.questions.filter(question => answers[question.id] === question.correctOption).length;
  return { answers, answered, correct, finalized: Boolean(state.finalized), selectedQuestion: state.selectedQuestion };
}

async function publishProgress(store, library, patch = {}) {
  const current = { ...store.getState(), ...patch };
  const activeQuiz = { ...current.activeQuiz, progress: progressFor(current.activeQuiz, current), updatedAt: new Date().toISOString() };
  store.setState({ ...patch, activeQuiz });
  if (current.readOnly || !library) return;
  try {
    await library.put(activeQuiz);
    store.setState({ libraryItems: await library.list() });
  } catch (error) {
    store.setState({ notice: { type: "error", message: error.message || "Não foi possível salvar o progresso." } });
  }
}

function reviewMarkup(quiz, state) {
  const progress = progressFor(quiz, state);
  return `<section class="review-sheet"><p class="question-kicker">Resultado</p><h2>Revisão do simulado</h2>
    <div class="metrics-strip"><strong>${progress.correct}/${quiz.questions.length}</strong><span>acertos</span><strong>${progress.answered}</strong><span>respondidas</span></div>
    <div class="review-list">${quiz.questions.map(question => {
      const answer = state.answers[question.id];
      const correct = answer === question.correctOption;
      return `<article><strong>Questão ${question.number}</strong><span>${answer ? (correct ? "Correta" : `Marcada ${escapeHtml(answer)} · correta ${escapeHtml(question.correctOption)}`) : "Não respondida"}</span></article>`;
    }).join("")}</div><button class="btn btn-primary" type="button" id="restart-study">Reiniciar simulado</button></section>`;
}

export function renderStudyView(container, store, library) {
  const state = store.getState();
  const quiz = state.activeQuiz;
  if (!keyboardStores.has(store)) {
    keyboardStores.add(store);
    document.addEventListener("keydown", event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      const current = store.getState();
      if (current.route !== "study" || current.finalized || !current.activeQuiz) return;
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const target = Math.min(Math.max(current.selectedQuestion + offset, 0), current.activeQuiz.questions.length - 1);
      if (target === current.selectedQuestion) return;
      event.preventDefault();
      void publishProgress(store, library, { selectedQuestion: target });
    });
  }
  if (!quiz?.questions.length) {
    container.innerHTML = `<section class="empty-state"><h2>Nenhum simulado carregado</h2><p>Importe ou abra um simulado da biblioteca.</p><button class="btn btn-primary" type="button" data-go-import>Importar questões</button></section>`;
    container.querySelector("[data-go-import]")?.addEventListener("click", () => store.setState({ route: "import" }));
    return;
  }
  if (state.finalized) {
    container.innerHTML = reviewMarkup(quiz, state);
    container.querySelector("#restart-study").addEventListener("click", () => void publishProgress(store, library, { answers: {}, finalized: false, selectedQuestion: 0 }));
    return;
  }

  const selectedIndex = Math.min(Math.max(state.selectedQuestion, 0), quiz.questions.length - 1);
  const question = quiz.questions[selectedIndex];
  const answered = Object.keys(state.answers).length;
  container.innerHTML = `<div class="study-layout"><aside class="question-map" aria-label="Navegação das questões"><strong>${escapeHtml(quiz.title)}</strong><div>${quiz.questions.map((item, index) => `<button type="button" class="question-map-button${index === selectedIndex ? " active" : ""}${state.answers[item.id] ? " answered" : ""}" data-question-index="${index}" aria-label="Ir para questão ${item.number}">${item.number}</button>`).join("")}</div></aside>
    <div class="study-main"><div class="metrics-strip"><strong>${selectedIndex + 1}/${quiz.questions.length}</strong><span>questão atual</span><strong>${answered}</strong><span>respondidas</span></div>${renderStudyQuestionMarkup(question, selectedIndex, state)}
    <div class="study-actions"><button class="btn btn-secondary" type="button" id="previous-question" ${selectedIndex === 0 ? "disabled" : ""}>Anterior</button>${state.answers[question.id] ? '<button class="btn btn-secondary" type="button" id="clear-answer">Limpar resposta</button>' : ""}${selectedIndex < quiz.questions.length - 1 ? '<button class="btn btn-secondary" type="button" id="next-question">Próxima</button>' : ""}<button class="btn btn-primary" type="button" id="finish-study">Finalizar simulado</button></div></div></div>`;

  for (const button of container.querySelectorAll("[data-option]")) {
    button.addEventListener("click", () => {
      const label = button.dataset.option;
      void publishProgress(store, library, { answers: { ...store.getState().answers, [question.id]: label } });
      queueMicrotask(() => container.querySelector(`[data-option="${label}"]`)?.focus());
    });
  }
  for (const button of container.querySelectorAll("button[data-question-index]")) button.addEventListener("click", () => void publishProgress(store, library, { selectedQuestion: Number(button.dataset.questionIndex) }));
  container.querySelector("#previous-question")?.addEventListener("click", () => void publishProgress(store, library, { selectedQuestion: selectedIndex - 1 }));
  container.querySelector("#clear-answer")?.addEventListener("click", () => { const answers = { ...store.getState().answers }; delete answers[question.id]; void publishProgress(store, library, { answers }); });
  container.querySelector("#next-question")?.addEventListener("click", () => void publishProgress(store, library, { selectedQuestion: selectedIndex + 1 }));
  container.querySelector("#finish-study").addEventListener("click", () => void publishProgress(store, library, { finalized: true }));
}
