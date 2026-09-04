import { migrateQuiz } from "../../core/quiz-schema.js";

export function parse(text) {
  const source = String(text ?? "").trim();
  const fenced = source.match(/```json\s*([\s\S]*?)```/iu);
  const json = fenced ? fenced[1].trim() : source;
  return migrateQuiz(JSON.parse(json));
}
