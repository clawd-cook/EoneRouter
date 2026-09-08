# EoneRouter v1 final fix wave

## Scope

- Persist non-empty popup state before requesting optional host permission.
- Gate DNR installation on `chrome.permissions.contains()` and rebuild on `permissions.onAdded`.
- Add `%5F_eone` route-folder warnings to all three handlers and `AGENTS.md`.
- Set `Vary: X-Eone-Id` on proxy pass/skip and rewrite responses.

## TDD evidence

Command:

```text
pnpm test
```

Before implementation, the new tests failed for the intended missing behavior:

- unauthorized rebuild added a DNR rule;
- no `permissions.onAdded` listener was registered;
- popup requested permission before persisting state;
- denial did not leave the new state persisted;
- proxy pass and rewrite responses had no `Vary`.

After implementation:

```text
tests 45
pass 45
fail 0
duration_ms 249.1355
```

The suite emits the existing `MODULE_TYPELESS_PACKAGE_JSON` warning. Per the review constraint, `package.json` was not changed to add `"type": "module"`.

## Verification commands

All Node/pnpm commands ran after:

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
pnpm test
# exit 0; 45 passed, 0 failed

pnpm exec tsc --noEmit
# exit 0

pnpm exec eslint app proxy.ts extension proxy.test.ts next.config.ts postcss.config.mjs eslint.config.mjs
# exit 0

pnpm build
# exit 0; compiled successfully; /__eone/files, /__eone/invalid,
# and /__eone/missing appeared in the production route table
```

`pnpm build` retained the pre-existing workspace-root/NFT tracing warnings.

## Production-server curl evidence

Built with `pnpm build`, then ran:

```text
PORT=3417 pnpm start
```

Guide request:

```text
curl -sS -o /dev/null -D - -w 'STATUS:%{http_code}\n' http://localhost:3417/
# STATUS:200

curl -sS http://localhost:3417/ | rg -o '本地静态资源访问引导'
# 本地静态资源访问引导
```

Header-selected package request:

```text
curl -sS -o /dev/null -D - -w 'STATUS:%{http_code}\n' \
  -H 'X-Eone-Id: eone-1' http://localhost:3417/
# STATUS:200
# vary: X-Eone-Id
# x-middleware-rewrite: /__eone/files

curl -sS -H 'X-Eone-Id: eone-1' http://localhost:3417/ \
  | rg -o '<title>[^<]*'
# <title>Document
```

This proves the production server switches from the Next guide to `storage/eone-1/index.html`.

## Constraints and concerns

- Chrome unpacked-extension UI checks were not run and are not claimed.
- The Next MCP/browser loop was unavailable because Next 16.2.9 is below the skill's 16.3 minimum; Next was not upgraded.
- The proxy-level tests confirm `Vary: X-Eone-Id` on pass and rewrite `NextResponse` objects. Next 16.2.9's App Page production runtime overwrites custom `Vary` on the final no-header prerendered guide response with its internal RSC vary list; the rewritten route-handler response retains `X-Eone-Id`. Fixing that upstream runtime behavior would require a Next upgrade or an out-of-scope routing workaround.
