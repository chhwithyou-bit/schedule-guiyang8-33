# Mobile Keyboard Modal Debug Report

Date: 2026-06-21
Status: DONE

## Symptom

On mobile, opening the post composer or login/register modal and focusing an input often left the modal positioned behind the phone keyboard instead of sitting above it.

## Root Cause

`AuthModal.svelte` and `PostModal.svelte` used fixed full-screen frames with `inset: 0`, and the post modal also used `100svh` for mobile max height. On mobile browsers, especially iOS-style visual viewport behavior, the layout viewport can remain taller than the visible area when the keyboard opens. The fixed modal kept positioning against the old viewport, so its lower controls could be covered by the keyboard.

## Fix

`App.svelte` now listens to `window.visualViewport` resize/scroll and writes CSS variables for the currently visible modal viewport height and top offset. The auth and post modal frames use those variables for their fixed frame position and height, and their shells are max-height constrained and scrollable inside that visible region.

## Evidence

- `npm run test:unit` passed: 25 tests.
- `npm run check` passed in `v5-svelte-migration` with 0 errors and existing unused CSS selector warnings.
- `npm run build` passed in `v5-svelte-migration`; Vite emitted the same unused CSS selector warnings and refreshed the static assets.

## Regression Test

Added `tests/unit/modalKeyboardViewport.test.mjs` to assert modal frames use visual viewport CSS variables and do not return to `inset: 0` frame positioning.

## Follow-up: Comment Composer

The mobile comment composer had the same visual viewport class of bug, but in `PostDetail.svelte` instead of a modal. The detail surface used `fixed inset-0` and an internal `h-full` shell, so the footer composer stayed at the old layout viewport bottom when the keyboard opened. `PostDetail.svelte` now uses the same visual viewport CSS variables for the detail frame `top` and `height`, keeping the composer inside the visible panel above the keyboard.

Evidence:

- `npm run test:unit` passed: 26 tests.
- `npm run build:dist` passed in `v5-svelte-migration`; Vite emitted existing unused CSS selector warnings unrelated to this fix.

Regression test:

- Extended `tests/unit/commentComposerLayout.test.mjs` to assert the post detail frame no longer uses `fixed inset-0` and follows `--app-modal-viewport-top` / `--app-modal-viewport-height`.

## Follow-up: All Text Input Surfaces

Ran a keyboard safety audit across every page-owned text input surface found in the Svelte app:

- Login/register username and password fields.
- Post composer textarea.
- Community search input.
- Post detail comment input.
- Post detail report textarea.
- Profile signature textarea.
- Admin announcement textarea.

The audit found that ordinary page inputs such as community search could still sit under the simulated keyboard because they were not inside a visual-viewport-constrained modal/detail shell. `App.svelte` now adds a global `focusin` guard for keyboard text fields. On focus, it reads the current visual viewport CSS variables and scrolls the nearest scroll container, or the window, so the focused input stays above the keyboard line. File inputs and browser `prompt()` dialogs are intentionally excluded because the browser owns those UI surfaces.

`ProfileView.svelte` also now uses the visual viewport variables for its fixed overlay, matching the modal and post detail behavior.

Evidence:

- `node scripts/verify-mobile-keyboard-inputs.mjs` passed and reported all audited inputs above the simulated keyboard line.
- `npm run test:unit` passed: 28 tests.
- `npm run build:dist` passed in `v5-svelte-migration`; Vite emitted existing unused CSS selector warnings unrelated to this fix.

Regression coverage:

- Added `scripts/verify-mobile-keyboard-inputs.mjs` for repeatable browser-level keyboard auditing with mocked API data.
- Extended `tests/unit/modalKeyboardViewport.test.mjs` to cover the global focused-input guard.
- Extended `tests/unit/commentComposerLayout.test.mjs` to cover the profile overlay viewport behavior.
