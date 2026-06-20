# Community Svelte Rust Design

**Date:** 2026-04-19

## Goal

Collapse the site into one canonical Svelte frontend and one canonical Rust Worker backend, remove legacy site surfaces, and keep only the product areas the user approved:

- Community
- Profile
- Admin

The Community area must include feed, discovery/search, messaging, groups, and notifications.
Theme switcher and loading animation remain as shell-level features.

## Frozen Product Scope

### Keep

- Community feed
- Post composer with image upload
- Comments
- Likes
- Follows
- Profile pages
- Discovery and search
- Direct chat
- Group chat
- Notifications
- Reports
- Announcements
- Admin moderation
- Admin media/storage operations
- Theme switching
- Loading animation

### Remove From Primary UX

- Schedule
- Nodes
- Xiangqi
- Legacy console-first information architecture
- User-facing drive page/module
- Duplicate old-site entrypoints

## Information Architecture

### Top Level

- Community
- Profile
- Admin

### Community Subsections

- Feed
- Discovery
- Messages
- Notifications

### Profile

- Account/profile editing
- Avatar/background updates
- Signature
- User's own posts

### Admin

- Users
- Posts/comments/reports moderation
- Announcements
- Group/message governance
- Media pipeline operations

## Interaction Rules

- One rounded visual language across cards, buttons, drawers, and modals
- No square panels inside rounded-glass shells
- Mobile-first safe spacing and no overlay collisions
- Theme switcher and loader stay at shell level, not page-local

## Architecture Direction

### Frontend

- Promote the Svelte app as the only canonical UI
- Route all product surfaces through the same shell
- Keep `ProfileView` for viewing other users
- Add a dedicated top-level personal/profile page for the signed-in user
- Move messaging and notifications under Community instead of a standalone console page

### Backend

Rust Worker is the only canonical API surface.

Planned domains:

- auth
- community_posts
- profiles
- messaging
- admin
- media

### Media Flow

- Post images now write to R2 first as the user-facing source of truth
- Public reads go through `/api/community/media/:key`
- Google Drive acts as the asynchronous archive/backfill source when configured
- No user-facing drive module in the final IA

## Migration Strategy

Use vertical slices instead of a big-bang rewrite:

1. Fix frontend-to-Rust API mismatches
2. Collapse shell/navigation to Community/Profile/Admin
3. Move messages and notifications under Community
4. Add dedicated personal page
5. Remove old product areas from primary UX
6. Replace leftover legacy routes and JS business-path dependencies
7. Finish admin media operations

## Acceptance Bar

- Desktop and mobile both support the primary flows
- No missing approved features
- No exposed old-site primary navigation
- One consistent interaction system
- Rust Worker is the canonical backend path for approved features
