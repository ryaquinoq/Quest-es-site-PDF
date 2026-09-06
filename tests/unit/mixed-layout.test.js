import test from 'node:test';
import assert from 'node:assert/strict';
import { importQuiz } from '../../js/import/pipeline.js';
const source = `Questão 1
Qual a conduta adequada para o paciente descrito?
A) Primeira conduta com dados adicionais.
B) Segunda conduta com dados adicionais.
C) Terceira conduta com dados adicionais. D) Quarta conduta com dados adicionais.
Resposta correta: B
Justificativa A: Motivo A.
Justificativa B: Motivo B.
Justificativa C: Motivo C.
Justificativa D: Motivo D.
Fonte: Aula.
Take home message: Revisar.`;
test('mixed inline and separate options cannot lose option D', () => {
 for (const text of [source,source.replace('D) ', '(D) '),source.replace('D) ', 'D)')]) {
  const r = importQuiz(text);
  const q = r.quiz.questions[0];
  assert.equal(q.options.map(o=>o.label).join(''),'ABCD');
  assert.equal(q.options[2].text,'Terceira conduta com dados adicionais.');
  assert.equal(q.feedback.D,'Motivo D.');
  assert.notEqual(r.diagnostics[0].status,'blocked');
 }
});
test('PDF-like line wrapping preserves every option and answer', () => {
 for (const width of [40,60,80,100,120]) {
  const compact = source.replace(/\n/g,' ');
  const wrapped = compact.replace(new RegExp('(.{1,'+width+'})(?: +|$)','g'),'$1\n');
  const r = importQuiz(wrapped);
  assert.equal(r.quiz.questions[0]?.options.length,4,'width '+width);
  assert.equal(r.quiz.questions[0]?.correctOption,'B','width '+width);
  assert.notEqual(r.diagnostics[0]?.status,'blocked','width '+width);
 }
});
