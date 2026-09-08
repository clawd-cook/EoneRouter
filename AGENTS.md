# AGENTS.md

## Runtime (hard constraint)

Develop and run this repo **only** with the **local nvm Node.js 24.20.0** install. Do not use any other Node version, package manager, or isolated environment.

Pinned version (see `.node-version`): **v24.20.0**

Before any install, lint, typecheck, `next dev`, or `next build`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"
nvm use 24.20.0
```

Confirm both of these before continuing:

```bash
node -v          # must print v24.20.0
which node       # must be $HOME/.nvm/versions/node/v24.20.0/bin/node
```

If `node -v` is not `v24.20.0`, **stop**. Do not fall back.

`nvm use 24.20.0` in the **current shell** is required and does not need extra confirmation. Do **not** change nvm’s default alias, install another Node, or edit shell rc files to make 24 global.

### Do not use

- Homebrew Node (`/opt/homebrew/bin/node`, currently newer than 24)
- Other nvm versions on this machine (`v14.21.3`, `v22.23.2`, or anything except `v24.20.0`)
- Docker, Dev Containers, Nix, asdf, fnm, volta, n, or cloud/CI sandboxes for local work
- `bun`, `yarn`, or `npm` for dependency install (lockfile is `pnpm-lock.yaml`)
- Changing `.node-version` or introducing a second runtime

`nvm use` without a version fails here: this repo has `.node-version`, not `.nvmrc`. Always pass `24.20.0`.

## High-risk operations (ask first)

**Stop and get an explicit yes from the user** before any operation that changes the machine outside this repository. Do not proceed on implied consent, “it would help”, or because a skill/docs suggested it.

Requires confirmation:

- **Global package installs** — `npm i -g`, `pnpm add -g`, `yarn global`, `bun add -g`, `brew install` / `brew upgrade`, OS package managers, editor/CLI plugins installed for all projects
- **Global or extra-repo deletes** — anything outside the checkout: `~/.nvm`, Homebrew prefixes, `/usr/local`, `/opt/homebrew`, other clones, shell history, credentials, nvm versions, `rm -rf` on home or system paths
- **Global environment switches** — `nvm alias default`, `nvm install`, `nvm uninstall`, changing default Node, editing `~/.zshrc` / `~/.bashrc` / `~/.zprofile`, mutating `PATH` persistently, Docker/context switches, logging into cloud CLIs
- **Destructive git/machine actions** — `git push --force`, hard reset of shared branches, rewriting git config, skipping hooks
- **Secrets and identity** — writing credentials, SSH keys, tokens, or changing git `user.*`

How to ask: state the exact command, what it changes (path + scope), why you think it is needed, and a repo-local alternative if one exists (`pnpm add -D`, `pnpm dlx`, `pnpm exec`). Wait for a clear yes. If the user says no or does not answer, skip it and continue with in-repo tools only.

Prefer in-repo, session-local work: `pnpm add` / `pnpm add -D`, `pnpm dlx`, `pnpm exec`, and `nvm use 24.20.0` in this shell.

## Required skills (mandatory)

Read the listed `SKILL.md` **before** writing or reviewing that kind of code. Follow the skill; do not improvise from memory. User chat instructions and this file still win if they conflict with a skill (Node 24, no extra environments, ask before global installs).

| When | Skill | Path |
| --- | --- | --- |
| Writing or reviewing **Next.js / App Router** code | `next-best-practices` **and** `vercel-react-best-practices` | `.agents/skills/next-best-practices/SKILL.md`, `.agents/skills/vercel-react-best-practices/SKILL.md` |
| Building or publishing a **Chrome extension** | `chrome-extensions` | `.agents/skills/chrome-extensions/SKILL.md` |
| **Debugging / verifying** Next.js at runtime (after edits, UI bugs, route/RSC issues) | `next-dev-loop` | `.agents/skills/next-dev-loop/SKILL.md` |

### Next.js application code

Applies to `app/`, `next.config.ts`, Server Actions, route handlers, `proxy.ts`, metadata, `next/image`, `next/font`, and React components in this app.

1. Read `next-best-practices` (file conventions, RSC, async `params`/`cookies`/`headers`, `middleware` → `proxy`, errors, data patterns). Open the linked reference `.md` files for the topic you are changing.
2. Read `vercel-react-best-practices` (waterfalls, bundle size, server/client fetching, rerenders). Open the matching `rules/*.md` when the change hits that category.
3. Default to Server Components; add `'use client'` only when needed. Await Next 15+ async APIs. Use `next/image`, not raw `<img>`. Prefer `pnpm` scripts under Node 24.20.0.

### Chrome extensions

Applies when adding or changing a Manifest V3 extension (including a future package under this repo).

1. Read `chrome-extensions` and the relevant `references/extensions/*.md` **before** writing `manifest.json` or extension JS.
2. Manifest V3 only. Do not generate V2 APIs.
3. If the work is for Chrome Web Store publishing, create/update `CHROMEWEBSTORE.md` per that skill. Do not invent icon files you did not generate.
4. Do not `npm i -g` extension tooling without confirmation.

### Debugging Next.js (`next-dev-loop`)

Use this skill whenever you need to confirm a Next.js change **runs**, not only that it typechecks. Requires `pnpm dev` (Node 24.20.0).

This app is currently **Next.js 16.2.9**. The skill’s floor is **16.3+** (Turbopack + `/_next/mcp` `get_compilation_issues`) and **agent-browser >= 0.31.1**.

1. Read `.agents/skills/next-dev-loop/SKILL.md` and follow preflight (`/_next/mcp` `tools/list`, `agent-browser` session).
2. If Next is still below 16.3 or `agent-browser` is missing: **tell the user** what is missing and the proposed commands. **Do not** run `pnpm next upgrade` or `npm i -g agent-browser` until they explicitly yes (global install is high-risk; upgrading Next is a project-wide dependency change).
3. If they decline: say which runtime checks you cannot run, then verify with `pnpm exec tsc --noEmit`, targeted eslint, and a running `pnpm dev`. Do not claim the MCP + browser loop passed.
4. If preflight passes: edit, then verify compiles / no runtime errors / intended UI via MCP + `agent-browser`. Do not fall back to grepping source as a substitute for those two views.

## Project Overview

EoneRouter (`eone-router`) is a Next.js App Router app. It is a **single package**, not a multi-package monorepo.

Stack:

- Next.js `16.2.9` (App Router)
- React `19.2.4`
- TypeScript `^5` (`strict: true`)
- Tailwind CSS v4 via `@tailwindcss/postcss`
- ESLint 9 with `eslint-config-next` (core-web-vitals + TypeScript)

Layout:

- `app/` — routes, layout, global CSS
- `app/%5F_eone/` — `%5F_eone` is Next’s escaped underscore so public URLs remain `/__eone/...`; renaming it to `__eone` unregisters the routes.
- `extension/` — unpacked Chrome Manifest V3 extension
- `lib/eone/` — request classification and static package helpers
- `public/` — static assets
- `storage/` — static HTML fixtures (`eone-1`, `eone-2`)
- `proxy.ts` — request rewrites based on `X-Eone-Id`
- `.agents/skills/` — local agent skills; not application source
- `pnpm-workspace.yaml` — pnpm native-build allowlist (`allowBuilds` / `ignoredBuiltDependencies`), **not** a workspace package list

Path alias: `@/*` → repo root (`tsconfig.json`).

## Setup Commands

Use **pnpm** and Node 24.20.0 only.

```bash
export NVM_DIR="$HOME/.nvm"
. "/opt/homebrew/opt/nvm/nvm.sh"
nvm use 24.20.0
pnpm install
```

Do not run `npm install`, `yarn`, or `bun install`.

## Development Workflow

```bash
nvm use 24.20.0
pnpm dev          # next dev — http://localhost:3000
pnpm test         # node:test for lib/eone and extension/dnr.test.mjs
pnpm build        # next build
pnpm start        # next start (after build)
pnpm lint         # eslint
pnpm exec tsc --noEmit   # typecheck (no dedicated script yet)
```

Edit `app/page.tsx` and related App Router files; Fast Refresh applies in `pnpm dev`. Before those edits, follow **next-best-practices** and **vercel-react-best-practices**. After UI/runtime edits, follow **next-dev-loop**.

There is no `.env` template. Do not commit `.env*` (gitignored).

## Testing Instructions

`pnpm test` runs `node:test` for `lib/eone` and `extension/dnr.test.mjs`.
Do not invent Jest/Vitest/Playwright unless the project adds them.

Verify changes with:

1. `pnpm test`
2. `pnpm exec tsc --noEmit`
3. `pnpm lint` for app code (see caveat below)
4. `pnpm build` when the change can affect production output
5. For UI/route/RSC behavior, follow **next-dev-loop** (see Required skills). Do not treat typecheck alone as runtime proof.

When adding tests, colocate them with the code or under a `tests/` directory and add a `package.json` script. Do not place tests under `.agents/`.

### Lint caveat

`pnpm lint` currently lints `.agents/skills/**` and **fails** on vendored skill scripts (`require()` / unused vars). That is not an app regression. For application changes, also run:

```bash
pnpm exec eslint app next.config.ts postcss.config.mjs eslint.config.mjs
```

Do not “fix” skill vendor files unless the task is specifically about those skills.

## Code Style

- TypeScript-first. Keep `strict` on.
- Next.js/React: follow `next-best-practices` and `vercel-react-best-practices` (Required skills). Short reminders: Server Components by default; await async `params` / `searchParams` / `cookies()` / `headers()`; Next 16 uses `proxy.ts`, not `middleware.ts`; `next/image` not `<img>`.
- Chrome extension code: follow `chrome-extensions` (Manifest V3).
- Imports: `@/` alias for repo-root modules; ESM only (`import` / `export`).
- Styling: Tailwind v4 in `app/globals.css` (`@import "tailwindcss"`). No extra CSS framework.
- Formatting: no Prettier config. Match surrounding files; do not mass-reformat.
- Keep diffs small. Do not rewrite `README.md` or skill files unless asked.

## Build and Deployment

```bash
nvm use 24.20.0
pnpm build
pnpm start
```

Output lives in `.next/` (gitignored). No Dockerfile, no GitHub Actions yet. Do not add Docker/CI Node images that are not 24.x without an explicit request.

`next.config.ts` is currently empty defaults.

## Pull Request Guidelines

- Title: short, imperative, scoped (e.g. `Add static site routing for eone-1`)
- Before claiming done: `nvm use 24.20.0`, then `pnpm exec tsc --noEmit`, targeted eslint on app files, and `pnpm build` if routes or config changed. For Next UI/runtime claims, complete **next-dev-loop** (or state that it was blocked).
- Do not commit `.env*`, `.next/`, or `node_modules/`
- Do not expand scope into `.agents/skills` unless the task is about skills

## Additional Notes

- Default Homebrew `node` on PATH may be **not** 24. Always activate nvm 24.20.0 in the same shell as pnpm/next.
- Static package fixtures use the `storage/` spelling.
- Skills live under `.agents/skills/`. Do not edit them unless the task is about the skills themselves.
