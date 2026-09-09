# HTTP origin proxy whole-branch fix wave

## Scope

Fixed the two review findings only (no Minor list):

1. **previousProxy PAC overwrite** — `applyPac` refused to persist `mode === "pac_script"`, and `rebuild()` is serialized so `permissions.onAdded` and `eone-apply` cannot interleave captures.
2. **Orphan Next on bind/startup failure** — `scripts/next-with-env.mjs` awaits `stopChildProcess` (SIGTERM, then SIGKILL after a short timeout) before rethrowing.

## TDD evidence

Command (Node v24.20.0, no `pnpm test`, no `--experimental-default-type=module`):

```text
node --test --experimental-strip-types extension/background.test.mjs lib/eone/next-listen.test.ts
```

Before implementation, the new tests failed for the intended missing behavior:

- PAC `get()` overwrote `previousProxy: { mode: "system" }` with a `pac_script` config
- overlapping `eone-apply` + `onAdded` left `previousProxy` as the installed PAC
- `stopChildProcess` was not exported from `next-listen.ts` (`SyntaxError` on import)

After implementation:

```text
tests 92
pass 92
fail 0
duration_ms 490.342667
```

The suite emits the existing `MODULE_TYPELESS_PACKAGE_JSON` warning. `package.json` was not changed.

## Verification commands

All Node commands ran after:

```text
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"
nvm use 24.20.0
node -v
# v24.20.0
which node
# /Users/heyongqi10/.nvm/versions/node/v24.20.0/bin/node
```

Results:

```text
node --test --experimental-strip-types lib/eone/*.test.ts extension/*.test.mjs proxy.test.ts
# exit 0; 92 passed, 0 failed

./node_modules/.bin/tsc --noEmit
# exit 0
```

`pnpm test` / `pnpm install` were not run, per the fix-wave constraint.

## Fixes

### previousProxy must not store our PAC

`extension/background.js` `applyPac` still captures only when `pacActive` is false, but skips `chrome.storage.local.set({ previousProxy })` when `current.value.mode === "pac_script"`, keeping the existing captured config (typically `{ mode: "system" }`).

`rebuild()` is a mutex around `rebuildOnce()` so popup `eone-apply` and `permissions.onAdded` cannot both observe `pacActive === false` and race `proxy.settings.get()`.

Tests:

- `PAC get() does not overwrite a captured system previousProxy`
- `overlapping applies leave previousProxy as system`

### Bind/startup failure must not orphan Next

`stopChildProcess` in `lib/eone/next-listen.ts` sends SIGTERM, waits for `'exit'`, and SIGKILLs after `gracefulMs` (default 5s). The wrapper removes the child's `'exit'` listener (so the wrapper is not SIGTERM'd by its own shutdown handler), awaits `stopChildProcess`, then throws.

Tests extended on `lib/eone/next-listen.test.ts`: prompt exit after kill, and SIGKILL when the child ignores SIGTERM.
