export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderStudyQuestionMarkup(question, index, options = {}) {
  const hidden = options.hidden ? " hidden" : "";
  const optionMarkup = question.options.map(option => `
    <button
      class="option-item"
      type="button"
      data-option="${escapeHtml(option.label)}"
      aria-pressed="false"
    ><strong>${escapeHtml(option.label)})</strong> ${escapeHtml(option.text)}</button>
    <p class="option-feedback" data-option-feedback="${escapeHtml(option.label)}" hidden>
      ${escapeHtml(question.feedback?.[option.label] || "")}
    </p>`).join("");

  return `
    <article
      class="question-stage"
      data-study-question="${escapeHtml(question.id)}"
      data-question-index="${index}"
      ${hidden}
    >
      <p class="question-kicker">${escapeHtml(question.topic)}</p>
      <h2>Questão ${escapeHtml(question.number)}</h2>
      <p class="question-prompt">${escapeHtml(question.prompt)}</p>
      <div class="options-list">${optionMarkup}</div>
      <p class="take-home" data-take-home hidden>
        <strong>Para levar:</strong> ${escapeHtml(question.takeHome || question.keyPoint || "")}
      </p>
    </article>`;
}

export function renderStudyView(store) {
  const state = store.getState();
  const quiz = state.activeQuiz;
  const placeholder = document.querySelector("#simulado-placeholder");
  const view = document.querySelector("#simulado-view");
  const stage = document.querySelector("#question-stage");
  const sidebar = document.querySelector("#sidebar-nav");
  const stats = document.querySelector("#stats-header");

  placeholder.style.display = quiz?.questions.length ? "none" : "flex";
  view.style.display = quiz?.questions.length ? "grid" : "none";
  if (!quiz?.questions.length) return;

  const selectedIndex = Math.min(state.selectedQuestion, quiz.questions.length - 1);
  const question = quiz.questions[selectedIndex];
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderStudyQuestionMarkup(question, selectedIndex);
  stage.replaceChildren(...wrapper.firstElementChild.childNodes);
  stage.dataset.studyQuestion = question.id;

  for (const button of stage.querySelectorAll("[data-option]")) {
    const selected = state.answers[question.id] === button.dataset.option;
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => {
      store.setState(current => ({
        answers: { ...current.answers, [question.id]: button.dataset.option }
      }));
    });
  }

  sidebar.replaceChildren(...quiz.questions.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-quest-btn${index === selectedIndex ? " active" : ""}`;
    button.textContent = `Questão ${item.number}`;
    button.addEventListener("click", () => store.setState({ selectedQuestion: index }));
    return button;
  }));

  const answered = Object.keys(state.answers).length;
  stats.textContent = `${quiz.questions.length} questões · ${answered} respondidas`;
}
