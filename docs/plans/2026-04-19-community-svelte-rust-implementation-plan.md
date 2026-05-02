# Community Svelte Rust Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse the product into a single Svelte frontend and Rust Worker backend for Community, Profile, and Admin.

**Architecture:** Reuse the existing Svelte shell and Rust Worker routes where possible, remove old-site navigation and modules, and migrate mismatched frontend flows onto the Rust API surface before deeper cleanup.

**Tech Stack:** Svelte 4, TypeScript, Rust Cloudflare Worker, D1, KV, R2, Google Drive

---

### Task 1: Freeze shell and navigation

**Files:**
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/App.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/stores/appState.ts`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/layout/Header.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/layout/LiquidBar.svelte`

**Step 1:** Remove Schedule/Nodes/Xiangqi from the top-level shell.

**Step 2:** Add canonical top-level routing for `community`, `profile`, and `admin`.

**Step 3:** Preserve shell-level music/theme/loading behavior.

**Step 4:** Verify shell navigation compiles and the removed routes are no longer primary entrypoints.

### Task 2: Add canonical community subsection state

**Files:**
- Create: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/stores/communityViewState.ts`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/CommunityView.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/modals/CommunityConsole.svelte`

**Step 1:** Add a store for Community sub-sections.

**Step 2:** Render Community as `feed / discovery / messages / notifications`.

**Step 3:** Embed chat/groups/notifications views under Community instead of using a standalone console route.

**Step 4:** Hide the user-facing drive tab from the final Community IA.

### Task 3: Add a dedicated personal page

**Files:**
- Create: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/PersonalView.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/ProfileView.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/PostCard.svelte`

**Step 1:** Create a signed-in personal page.

**Step 2:** Keep `ProfileView` as the "view another user" surface.

**Step 3:** Route "my profile" clicks to the dedicated personal page.

### Task 4: Fix frontend-to-Rust API mismatches

**Files:**
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/modals/AuthModal.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/PostCard.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/ProfileView.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/src/lib.rs`

**Step 1:** Move auth UI to `/api/community/register`, `/api/community/login`, and `/api/community/me`.

**Step 2:** Align like behavior with the Rust Worker response shape.

**Step 3:** Ensure profile-to-chat transitions land in the Community messaging section.

**Step 4:** Change post image upload flow so R2 is the primary user-facing store and Google Drive becomes the async archive/backfill layer.

### Task 5: Refocus admin on moderation plus media operations

**Files:**
- Modify: `D:/yclovefen/schedule-guiyang8-33/v5-svelte-migration/src/components/views/AdminView.svelte`
- Modify: `D:/yclovefen/schedule-guiyang8-33/src/lib.rs`

**Step 1:** Remove Nodes as a primary admin tab.

**Step 2:** Add a media/storage operations tab.

**Step 3:** Surface Google Drive/R2 media pipeline status through Rust admin data.

### Task 6: Verification

**Files:**
- Modify as needed during fixes

**Step 1:** Run the available frontend and backend checks.

**Step 2:** Run targeted manual or automated verification for:
- auth
- feed
- discovery
- profile
- messaging
- notifications
- admin
- media upload/render

**Step 3:** Record remaining risks if full parity is not yet complete.
