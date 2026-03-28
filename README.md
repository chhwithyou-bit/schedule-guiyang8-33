# Trigger deployment

## E2E Debug

1. `npm install`
2. `npm run test:e2e:install`
3. `npm run test:e2e`

The Playwright suite starts `wrangler dev` automatically and mocks the chat, discovery, and group APIs so the liquid bar interactions can be verified deterministically.
