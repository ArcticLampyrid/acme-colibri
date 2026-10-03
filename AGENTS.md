## Spec Mainteinance Criteria
1. All features currently implemented should be described in `/spec/*`. 
2. Divide the spec into many small files if it is too long. Use bidirectional links to connect them.
3. The ideal spec are one that accurately reflects the current state of the module, is easy to read, and serves as a reliable reference for reproducing the behavior.
2. When working, please keep spec up-to-date. I.e., if you add a new feature, please update the spec accordingly. If you remove a feature, please remove it from the spec.
3. When editing spec, please make your changes integrated in the original text, rather than appending new text at the end. You should keep it as it exists on the beginning of this document.
4. Keep the document clean and easy to read, but do not hesitate to add necessary details to clarify the design. Record all important bussines logic in spec.
5. Make less but more accurate changes. Avoid making trivial changes that do not add value.

## Programming Style
- Prefer to use functional style over object-oriented style when possible.
- Pay attention to data flow and state management. Prefer immutable data structures when possible.
- Follow SSOT (Single Source of Truth) principle. Avoid duplicating data and logic across the codebase.
- Write modular code. Break down large functions into smaller, reusable functions. But avoid creating too many small functions that make the code hard to follow.
- Keep related data and functions together. Prefer to use AoS (Array of Structures) over SoA (Structure of Arrays) when it improves code clarity.
- Keep performance in mind, but do not sacrifice code readability for minor performance gains.

## Project Overview
acme-colibri is a Cloudflare Worker (TypeScript, Hono, Zod, Jose) implementing the acmeproxy / Lego httpreq protocol in front of upstream DNS providers (Cloudflare today), with a Svelte admin UI and D1 storage. Behavior is specified in `/spec/*` (start at `spec/README.md`); `README.md` is user-facing only and must stay concise.

## Commands
- `pnpm test` — Vitest inside the Workers runtime (`@cloudflare/vitest-plugin`, in-memory D1 via `migrations/`). Outbound `fetch` is stubbed with `vi.spyOn(globalThis, "fetch")` (see `test/helpers.ts`); tests never touch the network.
- `pnpm typecheck` — tsc (Worker + tests), tsc (Node-side: `vitest.config.ts`, `scripts/`), svelte-check (UI).
- `pnpm dev` — build UI + `wrangler dev` (needs `.dev.vars`, see `.dev.vars.example`, and `pnpm db:migrate:local`).

## Architecture Notes
- Routing split: only `/api/*`, `/present`, `/cleanup`, `/health` reach the Worker (`assets.run_worker_first`); the rest is the SPA.
- Auth modes (OIDC / passcode / disabled) are derived from env in `src/config.ts`; both end in the same signed session cookie.
- Providers are registered in `src/providers/index.ts`; a provider's `fields` drive validation, encryption split and the UI form. To add one: new file + one registry entry, plus tests and a `spec/dns-providers.md` update.
- The admin password is a cleartext Worker secret (`ADMIN_PASSWORD`) compared in constant time; no password hashing, because Argon2id exceeds the free plan's 10 ms CPU limit.
- D1 schema changes go in a new numbered file in `migrations/` (never edit applied ones); update `spec/data-model.md`.

## Hard Constraints
- **No audit features.** Do not add audit tables, request/operation logging, or audit-style `console.log`. `console.error` is only for diagnosing failures and must never include secrets, tokens, keys or passcodes.
- Never return or log zone provider secrets, Access Keys or key hashes from any API. Access Keys are shown only in the create / rotate-key responses.
- Any new name handling must go through `normalizeFqdn`; only `_acme-challenge.*` TXT operations may reach a provider.
- Changing `SECRET_KEY` derivation or the ciphertext format needs a versioned envelope (`v1.` prefix) and a migration story.
