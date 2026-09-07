# MedUp Local Learning Plan

## Objective

Evolve MedUp without a backend, accounts, or cloud database. Preserve existing IndexedDB quizzes, parser behavior, prompt compatibility, sharing, and the current visual identity.

## Global Constraints

- All personal data remains local in IndexedDB and must not leak into shared links or standalone HTML.
- Existing quizzes must load without destructive migration.
- Imported PDF, TXT, Markdown, and JSON remain supported.
- All option explanations remain visible after answering.
- New workflows must work at 390, 768, and 1440 px and be keyboard accessible.
- No publishing or push without explicit user authorization.

## Task 1: Data Contracts and Atomic Backup

Define normalized local metadata for `lastStudiedAt`, question bookmarks, doubts, and one error-review session. Add a versioned full-library backup codec with strict validation. Add repository-level atomic restore with preserve/replace conflict modes. Add unit tests for round-trip, invalid data, conflicts, rollback behavior, and old quizzes.

## Task 2: Backup and Resume UI

Add backup download and restore controls to the library. Preview incoming quiz counts and conflicts before restore. Highlight the most recently studied quiz with progress and a Continue action. Reuse current quiz-opening behavior and clamp stale question positions. Add focused UI and E2E coverage.

## Task 3: Bookmarks and Doubts

Add accessible favorite and doubt toggles to study questions. Persist by stable question ID in local metadata. Add All, Favorites, and Doubts filters without duplicating quiz content. Keep original question numbering and handle empty filters. Include metadata in full backup but exclude it from shared links and standalone HTML.

## Task 4: Error Review

Create a persistent review session from incorrectly answered questions only. Keep original answers/results immutable; the review has its own answers, position, and completion state. The selected question list stays fixed during a review. Add empty-state behavior and return-to-original flow.

## Task 5: Editable Import Preview

Add a navigable preview to the existing import review that displays prompt, options, answer, and all explanations. Allow editing and exclusion before saving. Work against an isolated draft, revalidate only the changed question, and never mutate the library until confirmation.

## Task 6: Integration and Visual QA

Apply existing MedUp styles to new controls, verify keyboard focus and long text, and test 390/768/1440 px. Run all unit and E2E tests, verify PDF/MD regression fixtures, and check standalone HTML after answering.

## Delivery

Commit each completed task separately. Do not push or publish until explicitly authorized.
