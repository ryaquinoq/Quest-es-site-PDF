import test from 'node:test';
import assert from 'node:assert/strict';
import { quizTitle } from '../../js/core/quiz-title.js';
test('greetings cannot become a quiz title', () => {
 assert.equal(quizTitle('Olá! Como professor de medicina, elaborei este simulado.',[{topic:'Pneumologia'}]),'Simulado: Pneumologia');
 assert.equal(quizTitle('Título: Simulado de Pneumologia'),'Simulado de Pneumologia');
 assert.equal(quizTitle('Cardiologia'),'Cardiologia');
});
