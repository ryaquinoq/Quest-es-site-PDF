import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createQuiz } from "../../js/core/quiz-schema.js";
import {
  MAX_DECOMPRESSED_BYTES,
  MAX_SHARE_URL_LENGTH,
  SHARE_FALLBACK_MESSAGE,
  decodeQuizFragment,
  encodeQuizFragment,
  getShareDecision
} from "../../js/share/codec.js";

test("compressed fragment round trips Unicode quiz data as base64url", async () => {
  const quiz = createQuiz({
    id: "quiz-unicode",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    title: "Emergências",
    questions: [{
      prompt: "Dor torácica",
      options: { A: "Ação", B: "Observação" },
      correctOption: "A"
    }]
  });

  const fragment = await encodeQuizFragment(quiz);

  assert.match(fragment, /^#quiz=v2\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeQuizFragment(fragment), quiz);
});

test("small quizzes produce a complete share URL below the policy limit", async () => {
  const quiz = createQuiz({
    id: "quiz-small",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    title: "Cardio",
    questions: [{
      prompt: "Conduta?",
      options: { A: "Tratar", B: "Observar" },
      correctOption: "A"
    }]
  });

  const decision = await getShareDecision(quiz, "https://medup.example/app?mode=study#old");

  assert.equal(decision.mode, "link");
  assert.match(decision.url, /^https:\/\/medup\.example\/app\?mode=study#quiz=v2\./);
  assert.ok(decision.url.length <= 12_000);
});

test("the 12000 character policy applies to the complete URL boundary", async () => {
  const quiz = { schemaVersion: 2, title: "Limite", questions: [] };
  const fragment = await encodeQuizFragment(quiz);
  const prefix = "https://medup.example/?padding=";
  const exactBaseUrl = prefix + "x".repeat(12_000 - prefix.length - fragment.length);

  const accepted = await getShareDecision(quiz, exactBaseUrl);
  const rejected = await getShareDecision(quiz, `${exactBaseUrl}x`);

  assert.equal(accepted.mode, "link");
  assert.equal(accepted.url.length, 12_000);
  assert.deepEqual(rejected, {
    mode: "html",
    message: SHARE_FALLBACK_MESSAGE
  });
});

test("oversized quizzes fall back to HTML", async () => {
  const quiz = JSON.parse(await readFile("tests/fixtures/long-quiz.json", "utf8"));

  const decision = await getShareDecision(quiz, "https://medup.example/");

  assert.equal(decision.mode, "html");
  assert.equal(decision.message, SHARE_FALLBACK_MESSAGE);
  assert.match(decision.message, /grande demais/i);
});

test("missing native compression falls back to HTML", async () => {
  const originalCompressionStream = globalThis.CompressionStream;
  Object.defineProperty(globalThis, "CompressionStream", {
    configurable: true,
    value: undefined
  });

  try {
    const decision = await getShareDecision({ schemaVersion: 2, questions: [] }, "https://medup.example/");
    assert.deepEqual(decision, {
      mode: "html",
      message: SHARE_FALLBACK_MESSAGE
    });
  } finally {
    Object.defineProperty(globalThis, "CompressionStream", {
      configurable: true,
      value: originalCompressionStream
    });
  }
});

test("missing native decompression falls back to HTML", async () => {
  const originalDecompressionStream = globalThis.DecompressionStream;
  Object.defineProperty(globalThis, "DecompressionStream", {
    configurable: true,
    value: undefined
  });

  try {
    const decision = await getShareDecision({ schemaVersion: 2, questions: [] }, "https://medup.example/");
    assert.deepEqual(decision, {
      mode: "html",
      message: SHARE_FALLBACK_MESSAGE
    });
  } finally {
    Object.defineProperty(globalThis, "DecompressionStream", {
      configurable: true,
      value: originalDecompressionStream
    });
  }
});

test("decode rejects oversized encoded payloads from fragments and URLs", async () => {
  const oversizedPayload = "A".repeat(MAX_SHARE_URL_LENGTH + 1);

  for (const input of [
    `#quiz=v2.${oversizedPayload}`,
    `https://medup.example/app#quiz=v2.${oversizedPayload}`
  ]) {
    await assert.rejects(
      decodeQuizFragment(input),
      /payload compartilhado excede o limite de 12000 caracteres/i
    );
  }
});

test("decode rejects complete fragments and URLs above the share limit", async () => {
  const validFragment = await encodeQuizFragment({ schemaVersion: 2, questions: [] });
  const inputs = [
    validFragment + "A".repeat(MAX_SHARE_URL_LENGTH - validFragment.length + 1),
    `https://medup.example/${"x".repeat(MAX_SHARE_URL_LENGTH)}${validFragment}`
  ];

  for (const input of inputs) {
    await assert.rejects(
      decodeQuizFragment(input),
      /link ou fragmento compartilhado excede o limite de 12000 caracteres/i
    );
  }
});

test("decode cancels deflate bombs before output exceeds the 2 MiB ceiling", async () => {
  assert.equal(MAX_DECOMPRESSED_BYTES, 2 * 1024 * 1024);
  const fragment = await encodeQuizFragment({
    schemaVersion: 2,
    introduction: "A".repeat(MAX_DECOMPRESSED_BYTES + 1),
    questions: []
  });
  assert.ok(fragment.length < MAX_SHARE_URL_LENGTH);

  await assert.rejects(
    decodeQuizFragment(fragment),
    /conteúdo descompactado excede o limite seguro de 2097152 bytes/i
  );
});
