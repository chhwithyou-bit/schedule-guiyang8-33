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
