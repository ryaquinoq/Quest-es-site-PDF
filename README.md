# MedUp

Workspace estático e privado para importar, organizar, estudar e compartilhar questões médicas. Todo o processamento acontece no navegador: não há backend, login, analytics ou envio de documentos para serviços externos.

## Fluxo recomendado

1. Abra `PROMPT-SUPREMO-MEDUP.md` ou use **Abrir Prompt Supremo** na tela de importação.
2. Cole o prompt no NotebookLM e substitua `[N]` pela quantidade desejada.
3. Leve a resposta ao Google Docs. Você pode copiar o texto diretamente ou exportá-lo como PDF.
4. No MedUp, importe `.pdf`, `.txt`, `.md` ou `.json` e revise os diagnósticos antes de confirmar.
5. Estude, edite e mantenha os simulados na biblioteca local do navegador.
6. Compartilhe por link comprimido quando o conteúdo couber no limite ou baixe um HTML autocontido para simulados maiores.

O formato atual do prompt antigo continua suportado. O formato canônico novo usa os delimitadores `=== INICIO DA QUESTAO ===` e `=== FIM DA QUESTAO ===` e é mais resistente às quebras do Google Docs e de PDFs.

## Executar localmente

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run serve
```

Acesse `http://127.0.0.1:4173`.

## Testes

```bash
npm test
npm run test:e2e
```

## Privacidade e armazenamento

- PDFs e textos não saem do dispositivo.
- A biblioteca usa IndexedDB no navegador.
- Links compartilhados carregam uma cópia somente para estudo no fragmento da URL.
- Quizzes grandes usam HTML offline porque URLs extensas não são confiáveis entre navegadores e mensageiros.
- PDF.js está versionado em `vendor/pdfjs`; o aplicativo não depende de CDN em tempo de execução.

## Publicação

O projeto é composto apenas por arquivos estáticos. Pode ser publicado no GitHub Pages, Vercel ou qualquer servidor HTTP sem configuração de backend.
