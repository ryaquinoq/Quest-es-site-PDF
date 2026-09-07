import { escapeHtml, renderStudyQuestionMarkup } from "../ui/views/study-view.js";
import { createShareableQuiz } from "./shareable-quiz.js";

function embeddedJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function generateStandaloneHtml(quiz) {
  const sharedQuiz = createShareableQuiz(quiz);
  const questions = sharedQuiz.questions;
  const questionMarkup = questions.map((question, index) => (
    renderStudyQuestionMarkup(question, index, { hidden: index > 0 })
  )).join("");
  const navigation = questions.map((question, index) => `
    <button type="button" data-go-to="${index}" ${index === 0 ? 'aria-current="step"' : ""}>
      ${escapeHtml(question.number)}
    </button>`).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(sharedQuiz.title)} - MedUp</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color: #17231e; background: #f2f4ef; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    button { font: inherit; }
    header { background: #064b37; color: #fff; padding: 18px max(20px, calc((100% - 1120px) / 2)); border-bottom: 4px solid #c39a4b; }
    header p, header h1 { margin: 0; }
    header p { margin-top: 4px; color: #dbe9e3; }
    .layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 24px; max-width: 1120px; margin: 0 auto; padding: 24px 20px 48px; }
    nav { align-self: start; position: sticky; top: 20px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    nav button { min-width: 36px; min-height: 36px; border: 1px solid #b9c4bd; border-radius: 6px; background: #fff; cursor: pointer; }
    nav button[aria-current="step"] { color: #fff; border-color: #086448; background: #086448; }
    main { min-width: 0; }
    .progress { margin: 0 0 12px; color: #5b6861; font-weight: 600; }
    .question-stage, #review { background: #fff; border: 1px solid #d9dfda; border-radius: 8px; padding: clamp(20px, 4vw, 40px); box-shadow: 0 10px 28px rgba(28, 45, 36, .08); }
    .question-kicker { color: #086448; font-weight: 700; margin: 0 0 8px; }
    h2 { font-family: Georgia, "Times New Roman", serif; margin: 0 0 18px; }
    .question-prompt { font-size: 1.08rem; line-height: 1.65; }
    .options-list { display: grid; gap: 10px; margin-top: 24px; }
    .option-item { width: 100%; min-height: 48px; padding: 12px 14px; text-align: left; color: #17231e; background: #fff; border: 1px solid #b9c4bd; border-radius: 8px; cursor: pointer; }
    .option-item:hover, .option-item:focus-visible { border-color: #086448; outline: 3px solid rgba(8, 100, 72, .18); outline-offset: 1px; }
    .option-item.selected { border-color: #086448; background: #eaf5f0; }
    .option-item.correct { border-color: #087b45; background: #e7f6ed; }
    .option-item.incorrect { border-color: #a51c30; background: #fbecef; }
    .option-feedback, .take-home { margin: -4px 0 4px; padding: 10px 12px; border-left: 3px solid #c39a4b; background: #faf8f1; }
    .take-home { margin-top: 18px; }
    .question-paper { background: white; border: 1px solid #d9dfda; border-radius: 16px; padding: 24px; }
    .question-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; font-size: 14px; color: #5b6861; }
    .question-meta span { padding: 4px 8px; border: 1px solid #d9dfda; border-radius: 20px; }
    .option-item { display: grid; grid-template-columns: 32px minmax(0,1fr); gap: 12px; align-items: start; line-height: 1.6; }
    .option-letter { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: #f2f4ef; font-weight: 700; }
    .option-copy { display: block; min-width: 0; overflow-wrap: anywhere; }
    .option-feedback { display: block; margin: 12px 0 0; white-space: pre-line; line-height: 1.6; }
    h1 { font-size: 24px; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-top: 18px; }
    .actions button, #review button { min-height: 42px; padding: 9px 15px; border: 1px solid #086448; border-radius: 6px; background: #fff; color: #086448; cursor: pointer; }
    .actions .primary { background: #086448; color: #fff; }
    button:disabled { cursor: not-allowed; opacity: .48; }
    #review-list { display: grid; gap: 12px; padding: 0; list-style: none; }
    #review-list li { border-left: 4px solid #a51c30; padding: 10px 12px; background: #f7f8f6; }
    #review-list li.correct { border-left-color: #087b45; }
    [hidden] { display: none !important; }
    @media (max-width: 700px) { .layout { grid-template-columns: 1fr; } nav { position: static; grid-template-columns: repeat(8, 1fr); } }
    @media print { header, nav, .actions, #reset { display: none !important; } .layout { display: block; padding: 0; } .question-stage, #review { box-shadow: none; border: 0; padding: 16px 0; } .question-stage[hidden] { display: block !important; break-after: page; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(sharedQuiz.title)}</h1>
    <p>${escapeHtml(sharedQuiz.introduction || `${questions.length} questões para estudo offline`)}</p>
  </header>
  <div class="layout">
    <nav aria-label="Questões">${navigation}</nav>
    <main>
      <p class="progress" id="progress"></p>
      <section id="study">${questionMarkup}</section>
      <div class="actions">
        <button type="button" id="previous">Anterior</button>
        <button type="button" id="next" class="primary">Próxima</button>
        <button type="button" id="finish" class="primary" disabled>Finalizar simulado</button>
      </div>
      <section id="review" hidden aria-labelledby="review-title">
        <h2 id="review-title">Revisão final</h2>
        <p id="score"></p>
        <ol id="review-list"></ol>
        <button type="button" id="reset">Recomeçar</button>
      </section>
    </main>
  </div>
  <script type="application/json" id="quiz-data" data-schema-version="${escapeHtml(sharedQuiz.schemaVersion)}">${embeddedJson(sharedQuiz)}</script>
  <script>
    (() => {
      "use strict";
      const quiz = JSON.parse(document.querySelector("#quiz-data").textContent);
      const answers = {};
      let current = 0;
      const stages = [...document.querySelectorAll("[data-study-question]")];
      const navButtons = [...document.querySelectorAll("[data-go-to]")];
      const progress = document.querySelector("#progress");
      const finish = document.querySelector("#finish");
      const study = document.querySelector("#study");
      const review = document.querySelector("#review");

      function showQuestion(index) {
        current = Math.max(0, Math.min(index, stages.length - 1));
        stages.forEach((stage, stageIndex) => { stage.hidden = stageIndex !== current; });
        navButtons.forEach((button, buttonIndex) => {
          if (buttonIndex === current) button.setAttribute("aria-current", "step");
          else button.removeAttribute("aria-current");
        });
        document.querySelector("#previous").disabled = current === 0;
        document.querySelector("#next").disabled = current === stages.length - 1;
        progress.textContent = "Questão " + (current + 1) + " de " + stages.length +
          " · " + Object.keys(answers).length + " respondidas";
      }

      function answer(stage, label) {
        const question = quiz.questions[Number(stage.dataset.questionIndex)];
        answers[question.id] = label;
        stage.querySelectorAll("[data-option]").forEach(button => {
          const selected = button.dataset.option === label;
          button.setAttribute("aria-pressed", String(selected));
          button.classList.toggle("selected", selected);
          button.classList.toggle("correct", button.dataset.option === question.correctOption);
          button.classList.toggle("incorrect", selected && label !== question.correctOption);
        });
        stage.querySelectorAll("[data-option-feedback]").forEach(item => {
          item.hidden = false;
        });
        const takeHome = stage.querySelector("[data-take-home]");
        takeHome.hidden = !takeHome.textContent.trim().replace("Para levar:", "").trim();
        finish.disabled = Object.keys(answers).length !== quiz.questions.length;
        showQuestion(current);
      }

      function showReview() {
        const list = document.querySelector("#review-list");
        list.replaceChildren();
        let correct = 0;
        quiz.questions.forEach(question => {
          const selected = answers[question.id];
          const isCorrect = selected === question.correctOption;
          if (isCorrect) correct += 1;
          const item = document.createElement("li");
          item.className = isCorrect ? "correct" : "";
          const title = document.createElement("strong");
          title.textContent = "Questão " + question.number + ": " +
            (isCorrect ? "correta" : "incorreta");
          const detail = document.createElement("p");
          detail.textContent = "Sua resposta: " + selected + ". Gabarito: " +
            question.correctOption + ".";
          item.append(title, detail);
          list.append(item);
        });
        document.querySelector("#score").textContent = correct + " de " +
          quiz.questions.length + " corretas";
        study.hidden = true;
        document.querySelector(".actions").hidden = true;
        review.hidden = false;
      }

      document.addEventListener("click", event => {
        const option = event.target.closest("[data-option]");
        if (option) answer(option.closest("[data-study-question]"), option.dataset.option);
        const destination = event.target.closest("[data-go-to]");
        if (destination) showQuestion(Number(destination.dataset.goTo));
      });
      document.querySelector("#previous").addEventListener("click", () => showQuestion(current - 1));
      document.querySelector("#next").addEventListener("click", () => showQuestion(current + 1));
      finish.addEventListener("click", showReview);
      document.querySelector("#reset").addEventListener("click", () => location.reload());
      showQuestion(0);
    })();
  </script>
</body>
</html>`;
}
