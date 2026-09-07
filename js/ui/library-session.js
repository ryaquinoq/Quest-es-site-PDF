function clampedQuestionIndex(quiz) {
  const maximum = Math.max((quiz.questions?.length || 0) - 1, 0);
  const value = Number(quiz.progress?.selectedQuestion);
  const index = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(index, 0), maximum);
}

export function openLocalQuizState(quiz) {
  return {
    activeQuiz: quiz,
    route: "study",
    selectedQuestion: clampedQuestionIndex(quiz),
    answers: { ...(quiz.progress?.answers || {}) },
    finalized: Boolean(quiz.progress?.finalized),
    studyFilter: "all",
    reviewMode: false,
    reviewAnswers: {},
    reviewFinalized: false,
    readOnly: false,
    notice: null
  };
}

export function selectMostRecentlyStudiedQuiz(quizzes = []) {
  let selected = null;
  let selectedTime = -Infinity;

  for (const quiz of quizzes) {
    const value = quiz.study?.lastStudiedAt;
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time) || time <= selectedTime) continue;
    selected = quiz;
    selectedTime = time;
  }

  return selected;
}

export function resumeActionLabel(quiz) {
  return quiz.progress?.finalized ? "Ver resultado" : "Continuar estudando";
}
