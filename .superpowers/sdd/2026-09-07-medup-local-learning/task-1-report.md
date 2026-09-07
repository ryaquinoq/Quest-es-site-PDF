# Task 1 Report: Data Contracts and Atomic Backup

## Status

Implementação concluída no branch `publish-medup`, sem push e sem subagentes.

## Files Changed

- `js/core/quiz-schema.js`: normalização canônica de `study` com defaults retrocompatíveis.
- `js/storage/backup.js`: criação e leitura estrita do backup `medup-backup` versão 1.
- `js/storage/library.js`: restore público e operações atômicas nos adapters de memória e IndexedDB.
- `tests/unit/quiz-schema.test.js`: defaults e descarte de IDs/respostas inválidos.
- `tests/unit/backup.test.js`: round-trip, validação e preview de conflitos.
- `tests/unit/library.test.js`: preserve/replace, rollback, normalização e transação IndexedDB única.
- `.superpowers/sdd/2026-09-07-medup-local-learning/task-1-report.md`: este relatório.

## TDD Evidence

### RED

- `node --test tests/unit/quiz-schema.test.js`
  - Exit 1; 8 testes, 6 passaram e 2 falharam.
  - Falha esperada: `study` era `undefined` para quiz antigo e metadados informados.
- `node --test tests/unit/backup.test.js`
  - A primeira execução confirmou o módulo ausente; após exports neutros, Exit 1 com 3 testes e 3 falhas de asserção.
  - Falhas esperadas: formato ausente, validação ausente e preview vazio.
- `node --test tests/unit/library.test.js`
  - Exit 1; 12 testes, 8 passaram e 4 falharam.
  - Falha esperada: `restore` ausente nos dois adapters e na biblioteca pública.

### GREEN

- `node --test tests/unit/quiz-schema.test.js`: Exit 0; 8/8 passaram.
- `node --test tests/unit/backup.test.js`: Exit 0; 3/3 passaram.
- `node --test tests/unit/library.test.js`: Exit 0; 12/12 passaram.
- `npm test`: Exit 0; 90/90 testes unitários passaram, 0 falhas.
- `git diff --check`: Exit 0; sem erros de whitespace.

## Self-Review

- `progress` não foi alterado; somente o campo irmão `study` foi acrescentado ao quiz canônico.
- IDs de bookmarks, dúvidas e revisão são deduplicados e filtrados pelas questões atuais.
- Respostas da revisão são mantidas somente para questões da revisão e opções atuais; posição é limitada ao tamanho da revisão.
- O parser de backup não aceita quiz avulso, formato/versão incorretos, IDs duplicados ou quizzes/questões malformados. Todas as rejeições usam mensagem clara iniciada por `Backup inválido:`.
- O adapter de memória restaura o snapshot completo em qualquer falha durante a operação.
- O adapter IndexedDB consulta conflitos e grava todos os registros na mesma transação `readwrite`.
- `createQuizLibrary.restore` normaliza toda a coleção antes de chamar o adapter e os métodos públicos anteriores foram preservados.
- Nenhum arquivo de UI, parser, prompt, estilo, sharing ou E2E foi alterado.

## Concerns

- A atomicidade IndexedDB foi verificada em teste unitário com uma implementação controlada da API de transações. E2E não foi alterado nem executado, conforme o escopo da task.
