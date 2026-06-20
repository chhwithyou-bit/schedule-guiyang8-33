# DEBUG REPORT

- Symptom: Community image uploads consistently failed through `/api/community/media/upload`.
- Root cause: There were two D1 binding type issues in the upload handler after the Worker build issue was resolved. `File::size()` was bound as an integer that reached D1 as a JS BigInt, and a missing `parent_id` was bound as JS `undefined`. Cloudflare D1 rejects both `bigint` and `undefined` bind values.
- Fix: `src/lib.rs` now converts upload size with `wasm_bindgen::JsValue::from_f64(size as f64)` and binds missing upload `parent_id` values as `wasm_bindgen::JsValue::NULL`. `scripts/build-worker.mjs` also defaults Windows builds to `stable-x86_64-pc-windows-gnullvm`, detects the local LLVM-MinGW path, and can reuse checked-in Worker artifacts only when no usable Rust toolchain is available.
- Evidence: `node scripts/build-worker.mjs` rebuilt the Worker successfully. A real local upload probe against `http://127.0.0.1:8791/api/community/media/upload` returned HTTP 200 with `ok: true`, `parent_id: null`, `size: 68`, and the returned media URL fetched back as HTTP 200 with `content-type: image/png` and 68 bytes.
- Regression test: `tests/unit/communityMediaStorage.test.mjs` checks that upload size and optional parent folder are bound with D1-compatible JS values. `tests/unit/buildWorkerFallback.test.mjs` checks the Worker build fallback path.
- Test suite: `npm run test:unit` passed 26 tests.
- Related: The upload path still logs an unrelated Rust warning for unused `cache_uploaded_media`.
- Status: DONE
