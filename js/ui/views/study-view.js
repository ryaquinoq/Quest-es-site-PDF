import {
  nearestVisibleIndex,
  reviewPosition,
  toggleQuestionId,
  visibleQuestionIndexes,
  wrongQuestionIds
} from "../study-session.js";

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
    return `<button class="option-item${stateClass}" type="button" data-option="${escapeHtml(option.label)}" aria-label="Alternativa ${escapeHtml(option.label)}: ${escapeHtml(option.text)}" aria-pressed="${chosen}">
      <span class="option-letter">${escapeHtml(option.label)}</span>
      <span class="option-copy"><span>${escapeHtml(option.text)}</span><span class="option-feedback" data-option-feedback="${escapeHtml(option.label)}" ${showFeedback ? "" : "hidden"}><strong>${correct ? "Correta" : "Incorreta"}:</strong> ${escapeHtml(question.feedback?.[option.label] || "Justificativa não informada no documento.")}</span></span>
    </button>`;
  }).join("");
}

export function renderStudyQuestionMarkup(question, index, options = {}) {
  const answers = options.answers || {};
  const bookmarked = Boolean(options.bookmarked);
  const doubt = Boolean(options.doubt);
  return `<article class="question-paper" data-study-question="${escapeHtml(question.id)}" data-question-index="${index}" ${options.hidden ? "hidden" : ""}>
    <div class="question-heading">
      <div class="question-meta"><span>${escapeHtml(question.topic)}</span><span>${escapeHtml(question.difficulty)}</span></div>
      ${options.showMarkers === false ? "" : `<div class="question-markers" aria-label="Marcações da questão">
        <button class="marker-button${bookmarked ? " selected" : ""}" type="button" data-toggle-marker="favorite" aria-pressed="${bookmarked}" title="${bookmarked ? "Remover dos favoritos" : "Adicionar aos favoritos"}">Favoritar</button>
        <button class="marker-button${doubt ? " selected" : ""}" type="button" data-toggle-marker="doubt" aria-pressed="${doubt}" title="${doubt ? "Remover dúvida" : "Marcar como dúvida"}">Dúvida</button>
      </div>`}
    </div>
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

async function persistQuiz(store, library, activeQuiz, patch = {}, durableFirst = false) {
  if (store.getState().readOnly || !library) {
    store.setState({ ...patch, activeQuiz });
    return;
  }
  if (!durableFirst) store.setState({ ...patch, activeQuiz });
  try {
    await library.put(activeQuiz);
    const libraryItems = await library.list();
    store.setState(durableFirst ? { ...patch, activeQuiz, libraryItems } : { libraryItems });
  } catch (error) {
    store.setState({ notice: { type: "error", message: error.message || "Não foi possível salvar o progresso." } });
  }
}

async function publishProgress(store, library, patch = {}) {
  const before = store.getState();
  const current = { ...before, ...patch };
  const timestamp = new Date().toISOString();
  let study = { ...current.activeQuiz.study, lastStudiedAt: timestamp };
  let progress = current.activeQuiz.progress;

  if (current.reviewMode) {
    const questionIds = study.errorReview?.questionIds || [];
    study.errorReview = {
      questionIds,
      answers: { ...current.reviewAnswers },
      selectedQuestion: reviewPosition(questionIds, current.activeQuiz.questions, current.selectedQuestion),
      finalized: Boolean(current.reviewFinalized),
      updatedAt: timestamp
    };
  } else {
    progress = progressFor(current.activeQuiz, current);
    if (current.finalized && !before.finalized) {
      study.errorReview = {
        questionIds: wrongQuestionIds(current.activeQuiz, current.answers),
        answers: {},
        selectedQuestion: 0,
        finalized: false,
        updatedAt: timestamp
      };
    }
  }

  const activeQuiz = { ...current.activeQuiz, progress, study, updatedAt: timestamp };
  const durableFirst = current.finalized && !before.finalized ||
    current.reviewFinalized && !before.reviewFinalized;
  await persistQuiz(store, library, activeQuiz, patch, durableFirst);
}

function normalReviewMarkup(quiz, state) {
  const progress = progressFor(quiz, state);
  const wrong = wrongQuestionIds(quiz, state.answers).length;
  return `<section class="review-sheet"><p class="question-kicker">Resultado</p><h2>Revisão do simulado</h2>
    <div class="metrics-strip"><strong>${progress.correct}/${quiz.questions.length}</strong><span>acertos</span><strong>${progress.answered}</strong><span>respondidas</span></div>
    <div class="review-list">${quiz.questions.map(question => {
      const answer = state.answers[question.id];
      const correct = answer === question.correctOption;
      return `<article><strong>Questão ${question.number}</strong><span>${answer ? (correct ? "Correta" : `Marcada ${escapeHtml(answer)} · correta ${escapeHtml(question.correctOption)}`) : "Não respondida"}</span></article>`;
    }).join("")}</div>
    <div class="study-actions">${wrong ? `<button class="btn btn-primary" type="button" id="start-error-review">Revisar ${wrong} ${wrong === 1 ? "erro" : "erros"}</button>` : ""}<button class="btn btn-secondary" type="button" id="restart-study">Reiniciar simulado</button></div></section>`;
}

function errorReviewMarkup(quiz, state) {
  const review = quiz.study?.errorReview;
  const correct = (review?.questionIds || []).filter(id => {
    const question = quiz.questions.find(item => item.id === id);
    return question && state.reviewAnswers[id] === question.correctOption;
  }).length;
  return `<section class="review-sheet"><p class="question-kicker">Ciclo de correção</p><h2>Revisão de erros concluída</h2>
    <div class="metrics-strip"><strong>${correct}/${review?.questionIds.length || 0}</strong><span>corrigidas nesta revisão</span></div>
    <p>Seu resultado original foi preservado. Você pode voltar a ele ou revisar novamente o mesmo conjunto.</p>
    <div class="study-actions"><button class="btn btn-secondary" type="button" id="repeat-error-review">Revisar novamente</button><button class="btn btn-primary" type="button" id="return-result">Voltar ao resultado</button></div></section>`;
}

function filterMarkup(quiz, state) {
  const favorites = quiz.study?.bookmarkedQuestionIds?.length || 0;
  const doubts = quiz.study?.doubtQuestionIds?.length || 0;
  return `<div class="study-filters" role="group" aria-label="Filtrar questões">
    <button type="button" data-study-filter="all" aria-pressed="${state.studyFilter === "all"}">Todas <span>${quiz.questions.length}</span></button>
    <button type="button" data-study-filter="favorites" aria-pressed="${state.studyFilter === "favorites"}">Favoritas <span>${favorites}</span></button>
    <button type="button" data-study-filter="doubts" aria-pressed="${state.studyFilter === "doubts"}">Dúvidas <span>${doubts}</span></button>
  </div>`;
}

function moveSelection(store, library, offset) {
  const state = store.getState();
  const reviewIds = state.reviewMode ? state.activeQuiz.study?.errorReview?.questionIds || [] : null;
  const indexes = visibleQuestionIndexes(state.activeQuiz, state.studyFilter, reviewIds);
  const currentPosition = Math.max(indexes.indexOf(state.selectedQuestion), 0);
  const nextPosition = Math.min(Math.max(currentPosition + offset, 0), indexes.length - 1);
  if (indexes[nextPosition] === state.selectedQuestion || indexes[nextPosition] == null) return;
  void publishProgress(store, library, { selectedQuestion: indexes[nextPosition] });
}

export function renderStudyView(container, store, library) {
  const state = store.getState();
  const quiz = state.activeQuiz;
  if (!keyboardStores.has(store)) {
    keyboardStores.add(store);
    document.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
      const current = store.getState();
      if (current.route !== "study" || current.finalized && !current.reviewMode || !current.activeQuiz) return;
      event.preventDefault();
      moveSelection(store, library, event.key === "ArrowRight" ? 1 : -1);
    });
  }
  if (!quiz?.questions.length) {
    container.innerHTML = `<section class="empty-state"><h2>Nenhum simulado carregado</h2><p>Importe ou abra um simulado da biblioteca.</p><button class="btn btn-primary" type="button" data-go-import>Importar questões</button></section>`;
    container.querySelector("[data-go-import]")?.addEventListener("click", () => store.setState({ route: "import" }));
    return;
  }
  if (state.reviewMode && state.reviewFinalized) {
    container.innerHTML = errorReviewMarkup(quiz, state);
    container.querySelector("#return-result").addEventListener("click", () => store.setState({ reviewMode: false, reviewFinalized: false }));
    container.querySelector("#repeat-error-review").addEventListener("click", () => void publishProgress(store, library, { reviewAnswers: {}, reviewFinalized: false, selectedQuestion: visibleQuestionIndexes(quiz, "all", quiz.study.errorReview.questionIds)[0] || 0 }));
    return;
  }
  if (state.finalized && !state.reviewMode) {
    container.innerHTML = normalReviewMarkup(quiz, state);
    container.querySelector("#restart-study").addEventListener("click", () => void publishProgress(store, library, { answers: {}, finalized: false, selectedQuestion: 0, studyFilter: "all" }));
    container.querySelector("#start-error-review")?.addEventListener("click", () => {
      const review = store.getState().activeQuiz.study.errorReview;
      const first = visibleQuestionIndexes(quiz, "all", review.questionIds)[0] || 0;
      store.setState({ reviewMode: true, reviewAnswers: { ...review.answers }, reviewFinalized: Boolean(review.finalized), selectedQuestion: first });
    });
    return;
  }

  const reviewIds = state.reviewMode ? quiz.study?.errorReview?.questionIds || [] : null;
  const indexes = visibleQuestionIndexes(quiz, state.studyFilter, reviewIds);
  const selectedIndex = nearestVisibleIndex(indexes, state.selectedQuestion);
  if (selectedIndex < 0) {
    container.innerHTML = `<div class="study-toolbar">${filterMarkup(quiz, state)}</div><section class="empty-state"><h2>Nenhuma questão neste filtro</h2><p>Marque questões durante o estudo ou volte a exibir todas.</p><button class="btn btn-primary" type="button" data-show-all>Mostrar todas</button></section>`;
    container.querySelector("[data-show-all]").addEventListener("click", () => store.setState({ studyFilter: "all" }));
    for (const button of container.querySelectorAll("[data-study-filter]")) button.addEventListener("click", () => store.setState({ studyFilter: button.dataset.studyFilter }));
    return;
  }
  const question = quiz.questions[selectedIndex];
  const answers = state.reviewMode ? state.reviewAnswers : state.answers;
  const position = indexes.indexOf(selectedIndex);
  const answered = Object.keys(answers).filter(id => !reviewIds || reviewIds.includes(id)).length;
  const bookmarked = quiz.study?.bookmarkedQuestionIds?.includes(question.id);
  const doubt = quiz.study?.doubtQuestionIds?.includes(question.id);
  container.innerHTML = `${state.reviewMode ? `<div class="review-mode-banner"><strong>Revisão de erros</strong><span>${indexes.length} questões do resultado original</span><button class="btn btn-secondary" type="button" id="leave-error-review">Sair da revisão</button></div>` : `<div class="study-toolbar">${filterMarkup(quiz, state)}</div>`}
    <div class="study-layout"><aside class="question-map" aria-label="Navegação das questões"><strong>${escapeHtml(quiz.title)}</strong><div>${indexes.map(index => {
      const item = quiz.questions[index];
      return `<button type="button" class="question-map-button${index === selectedIndex ? " active" : ""}${answers[item.id] ? " answered" : ""}" data-question-index="${index}" aria-label="Ir para questão ${item.number}">${item.number}</button>`;
    }).join("")}</div></aside>
    <div class="study-main"><div class="metrics-strip"><strong>${position + 1}/${indexes.length}</strong><span>${state.reviewMode ? "na revisão" : "questão atual"}</span><strong>${answered}</strong><span>respondidas</span></div>${renderStudyQuestionMarkup(question, selectedIndex, { answers, bookmarked, doubt, showMarkers: !state.reviewMode })}
    <div class="study-actions"><button class="btn btn-secondary" type="button" id="previous-question" ${position === 0 ? "disabled" : ""}>Anterior</button>${answers[question.id] ? '<button class="btn btn-secondary" type="button" id="clear-answer">Limpar resposta</button>' : ""}${position < indexes.length - 1 ? '<button class="btn btn-secondary" type="button" id="next-question">Próxima</button>' : ""}<button class="btn btn-primary" type="button" id="finish-study">${state.reviewMode ? "Concluir revisão" : "Finalizar simulado"}</button></div></div></div>`;

  for (const button of container.querySelectorAll("[data-option]")) {
    button.addEventListener("click", () => {
      const key = state.reviewMode ? "reviewAnswers" : "answers";
      const nextAnswers = { ...store.getState()[key], [question.id]: button.dataset.option };
      void publishProgress(store, library, { [key]: nextAnswers, selectedQuestion: selectedIndex });
    });
  }
  for (const button of container.querySelectorAll("button[data-question-index]")) button.addEventListener("click", () => void publishProgress(store, library, { selectedQuestion: Number(button.dataset.questionIndex) }));
  for (const button of container.querySelectorAll("[data-study-filter]")) button.addEventListener("click", () => store.setState({ studyFilter: button.dataset.studyFilter }));
  for (const button of container.querySelectorAll("[data-toggle-marker]")) button.addEventListener("click", () => {
    const current = store.getState();
    const key = button.dataset.toggleMarker === "favorite" ? "bookmarkedQuestionIds" : "doubtQuestionIds";
    const activeQuiz = { ...current.activeQuiz, study: { ...current.activeQuiz.study, [key]: toggleQuestionId(current.activeQuiz.study?.[key], question.id) }, updatedAt: new Date().toISOString() };
    void persistQuiz(store, library, activeQuiz);
  });
  container.querySelector("#leave-error-review")?.addEventListener("click", () => store.setState({ reviewMode: false, reviewFinalized: false }));
  container.querySelector("#previous-question")?.addEventListener("click", () => moveSelection(store, library, -1));
  container.querySelector("#clear-answer")?.addEventListener("click", () => {
    const key = state.reviewMode ? "reviewAnswers" : "answers";
    const nextAnswers = { ...store.getState()[key] };
    delete nextAnswers[question.id];
    void publishProgress(store, library, { [key]: nextAnswers });
  });
  container.querySelector("#next-question")?.addEventListener("click", () => moveSelection(store, library, 1));
  container.querySelector("#finish-study").addEventListener("click", () => void publishProgress(store, library, state.reviewMode ? { reviewFinalized: true } : { finalized: true }));
}
