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
- `public/` — static assets
- `strorage/` — static HTML fixtures (`eone-1`, `eone-2`); keep the folder name as-is
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
pnpm build        # next build
pnpm start        # next start (after build)
pnpm lint         # eslint
pnpm exec tsc --noEmit   # typecheck (no dedicated script yet)
```

Edit `app/page.tsx` and related App Router files; Fast Refresh applies in `pnpm dev`.

There is no `.env` template. Do not commit `.env*` (gitignored).

## Testing Instructions

No test runner or `test` script is configured. Do not invent Jest/Vitest/Playwright until the project adds them.

Until then, verify changes with:

1. `pnpm exec tsc --noEmit`
2. `pnpm lint` for app code (see caveat below)
3. `pnpm build` when the change can affect production output
4. Manual check of `pnpm dev` at http://localhost:3000 for UI/route work

When adding tests, colocate them with the code or under a `tests/` directory and add a `package.json` script. Do not place tests under `.agents/`.

### Lint caveat

`pnpm lint` currently lints `.agents/skills/**` and **fails** on vendored skill scripts (`require()` / unused vars). That is not an app regression. For application changes, also run:

```bash
pnpm exec eslint app next.config.ts postcss.config.mjs eslint.config.mjs
```

Do not “fix” skill vendor files unless the task is specifically about those skills.

## Code Style

- TypeScript-first. Keep `strict` on.
- App Router defaults: Server Components unless `'use client'` is required.
- Next.js 16: `params` / `searchParams` / `cookies()` / `headers()` are async — await them.
- Next.js 16 renamed `middleware.ts` → `proxy.ts`. Do not add `middleware.ts`.
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
- Before claiming done: `nvm use 24.20.0`, then `pnpm exec tsc --noEmit`, targeted eslint on app files, and `pnpm build` if routes or config changed
- Do not commit `.env*`, `.next/`, or `node_modules/`
- Do not expand scope into `.agents/skills` unless the task is about skills

## Additional Notes

- Default Homebrew `node` on PATH may be **not** 24. Always activate nvm 24.20.0 in the same shell as pnpm/next.
- `next-dev-loop` MCP compile checks expect Next.js 16.3+. This app is **16.2.9** — do not assume `/_next/mcp` `get_compilation_issues` exists.
- `strorage/` is intentional spelling in this repo; do not rename it in passing.
- Follow `.agents/skills/next-best-practices` and `.agents/skills/vercel-react-best-practices` when writing React/Next code.
