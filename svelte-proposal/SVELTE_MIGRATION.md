# 8community v4.2 - Svelte Migration Architecture

## Overview
This document outlines the component tree and architectural strategy for migrating the monolithic HTML/JS `8community` web application to a modern Svelte (Vite) application. The migration heavily incorporates GSAP, Lenis.js, and Tailwind CSS while addressing the requested UX pain points and maintaining full backward compatibility with existing backend routes and APIs.

## Directory Structure

```text
src/
├── app.css              # Global styles, Tailwind directives, Lenis resets
├── main.js              # Entry point (Svelte mounting)
├── App.svelte           # Root application component
├── lib/
│   ├── actions/         # Svelte actions
│   │   ├── gsap.js      # IntersectionObserver/ScrollTrigger bindings
│   │   ├── lenis.js     # Lenis smooth scroll initialization
│   │   └── theme.js     # Theme switching logic
│   ├── api/             # API layer (fetch wrappers for worker.js)
│   │   ├── schedule.js
│   │   ├── community.js
│   │   └── nodes.js
│   ├── stores/          # Svelte stores (replacing global window state)
│   │   ├── admin.js     # adminUsersCache, commUser
│   │   ├── ui.js        # Active route, modal states, loading state
│   │   └── player.js    # Music player state
│   ├── utils/
│   │   └── helpers.js   # Pure formatting functions
│   ├── components/
│   │   ├── global/
│   │   │   ├── LoadingScreen.svelte   # Full-screen loader & snake-path SVG
│   │   │   ├── ThemeSwitcher.svelte   # Persistent top-right theme UI
│   │   │   ├── CustomCursor.svelte    # 8px lerping cursor
│   │   │   └── Modal.svelte           # Reusable modal wrapper with strict scroll-bleed prevention
│   │   ├── layout/
│   │   │   ├── LiquidHub.svelte       # Centralized bottom navigation (replacing Drawer + Dock)
│   │   │   ├── MusicPlayer.svelte     # Z-index isolated audio player
│   │   │   └── PageTransition.svelte  # GSAP curtain wipe wrapper
│   │   └── views/
│   │       ├── Schedule/
│   │       │   ├── ScheduleView.svelte
│   │       │   └── AdminUpload.svelte
│   │       ├── Community/
│   │       │   ├── CommunityView.svelte
│   │       │   ├── PostList.svelte
│   │       │   └── PostForm.svelte
│   │       ├── Nodes/
│   │       │   └── NodesView.svelte
│   │       └── Xiangqi/
│   │           └── XiangqiView.svelte
```

## Addressing UX Pain Points
1. **Z-axis and Spatial Conflicts:**
   - `LiquidHub.svelte` will manage the main navigation controls at the bottom, absorbing the role of the floating action button (`#comm-post-fab`).
   - `MusicPlayer.svelte` will have a tightly controlled Z-index and responsive layout, ensuring it sits adjacent or securely underneath the `LiquidHub` expanded bounds.
2. **Unified Navigation:**
   - The left `.drawer` is fully deprecated. `LiquidHub.svelte` becomes the single source of truth for switching views (`views/`).
3. **Gesture Conflicts:**
   - The `LiquidHub` drag handle will have an enlarged hit area (`py-4`).
   - Drag logic will rely on deliberate tap targets (using `on:click`) as the primary trigger, with swipe (touch) as a supplementary feature, avoiding OS-level swipe up conflicts.

## Key Design & Tech Implementations
- **Animations:** GSAP's `ScrollTrigger` and `CustomEase` integrated into reusable `use:gsap` Svelte actions.
- **Scroll:** `Lenis` initialized globally in `App.svelte` or `main.js`.
- **Theme Handling:** `<svelte:head>` script injection to prevent FOUC, managed via CSS custom properties on `:root`.

## Strict Standards
- **Semantic HTML:** Replacing `<div>` soup with `<main>`, `<article>`, `<header>`, etc.
- **Scroll Bleed Prevention:** `ui.js` store flag `$ui.modalOpen` dynamically binds `overflow: hidden` to the main wrapper or `<body>`.
- **API Continuity:** Re-using all existing endpoints (`/api/nodes`, `/api/community`) via pure JS wrappers without mutating JSON contracts.
