import test from "node:test";
import assert from "node:assert/strict";
import {
  nearestVisibleIndex,
  reviewPosition,
  toggleQuestionId,
  visibleQuestionIndexes,
  wrongQuestionIds
} from "../../js/ui/study-session.js";

const quiz = {
  questions: [
    { id: "q1", correctOption: "A" },
    { id: "q2", correctOption: "B" },
    { id: "q3", correctOption: "C" }
  ],
  study: { bookmarkedQuestionIds: ["q2"], doubtQuestionIds: ["q3"] }
};

test("study markers toggle and filters preserve original indexes", () => {
  assert.deepEqual(toggleQuestionId(["q1"], "q1"), []);
  assert.deepEqual(toggleQuestionId(["q1"], "q2"), ["q1", "q2"]);
  assert.deepEqual(visibleQuestionIndexes(quiz, "favorites"), [1]);
  assert.deepEqual(visibleQuestionIndexes(quiz, "doubts"), [2]);
  assert.deepEqual(visibleQuestionIndexes(quiz, "all"), [0, 1, 2]);
});

test("error review contains only answered incorrect questions", () => {
  assert.deepEqual(wrongQuestionIds(quiz, { q1: "B", q2: "B" }), ["q1"]);
  assert.deepEqual(visibleQuestionIndexes(quiz, "all", ["q3", "q1"]), [0, 2]);
  assert.equal(reviewPosition(["q3", "q1"], quiz.questions, 2), 0);
});

test("filtered selection falls back to the first visible question", () => {
  assert.equal(nearestVisibleIndex([1, 2], 0), 1);
  assert.equal(nearestVisibleIndex([1, 2], 2), 2);
  assert.equal(nearestVisibleIndex([], 2), -1);
});
