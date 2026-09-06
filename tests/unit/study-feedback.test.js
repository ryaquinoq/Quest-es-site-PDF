import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStudyQuestionMarkup } from '../../js/ui/views/study-view.js';
import { importQuiz } from '../../js/import/pipeline.js';

test('answering reveals every explanation and clearing hides them', () => {
 const q = { id:'q1', number:1, prompt:'Pergunta', correctOption:'B', options:[{label:'A',text:'Um'},{label:'B',text:'Dois'}], feedback:{A:'Erro A',B:'Motivo B'} };
 const before = renderStudyQuestionMarkup(q,0);
 assert.equal((before.match(/data-option-feedback="[AB]" hidden/g)||[]).length,2);
 const after = renderStudyQuestionMarkup(q,0,{answers:{q1:'A'}});
 assert.equal((after.match(/data-option-feedback="[AB]" hidden/g)||[]).length,0);
 assert.ok(after.includes('Erro A') && after.includes('Motivo B'));
});

test('multiline feedback preserves colon-containing prose and separates metadata', () => {
 const result = importQuiz('Questão 1\nPergunta?\nA) Um\nB) Dois\nResposta correta: B\nJustificativa A:\nMotivo:\nDetalhe do erro.\nJustificativa B:\nCorreta.\nTake home message: Resumo.\nFonte: Aula.');
 const q = result.quiz.questions[0];
 assert.equal(q.feedback.A,'Motivo:\nDetalhe do erro.');
 assert.equal(q.feedback.B,'Correta.');
 assert.equal(q.takeHome,'Resumo.');
 assert.equal(q.sourceReference,'Aula.');
});
