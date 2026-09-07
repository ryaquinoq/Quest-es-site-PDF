export function toggleQuestionId(ids = [], questionId) {
  const next = new Set(ids);
  if (next.has(questionId)) next.delete(questionId);
  else next.add(questionId);
  return [...next];
}

export function visibleQuestionIndexes(quiz, filter = "all", reviewQuestionIds = null) {
  const allowed = reviewQuestionIds
    ? new Set(reviewQuestionIds)
    : filter === "favorites"
      ? new Set(quiz.study?.bookmarkedQuestionIds || [])
      : filter === "doubts"
        ? new Set(quiz.study?.doubtQuestionIds || [])
        : null;
  return quiz.questions.flatMap((question, index) => (
    !allowed || allowed.has(question.id) ? [index] : []
  ));
}

export function wrongQuestionIds(quiz, answers = {}) {
  return quiz.questions
    .filter(question => answers[question.id] && answers[question.id] !== question.correctOption)
    .map(question => question.id);
}

export function nearestVisibleIndex(indexes, selectedIndex = 0) {
  if (!indexes.length) return -1;
  return indexes.includes(selectedIndex) ? selectedIndex : indexes[0];
}

export function reviewPosition(questionIds = [], questions = [], selectedIndex = 0) {
  const id = questions[selectedIndex]?.id;
  const position = questionIds.indexOf(id);
  return Math.max(position, 0);
}
