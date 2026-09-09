# EoneRouter

Next.js App Router app that serves static packages under `storage/` and exposes an admin panel at `/__eone/admin`.

## Runtime

Use **nvm Node.js v24.20.0** and **pnpm** only (see `.node-version` and `AGENTS.md`).

```bash
export NVM_DIR="$HOME/.nvm"
. "/opt/homebrew/opt/nvm/nvm.sh"
nvm use 24.20.0
pnpm install
pnpm dev
```

## Admin package upload

Operators upload a **`.zip`** whose **root is the site root** (for example `index.html` and `assets/...` at the top of the archive). The server extracts it into `storage/<id>/`.

Limits:

- HTTP body and uncompressed total: **100 MiB**
- Over that → HTTP 413 `包太大`

### Reverse proxy body size

If uploads fail with **413 Request Entity Too Large** before the app responds (common on nginx and similar gateways), raise the proxy limit to at least **100 MiB**.

Nginx example:

```nginx
client_max_body_size 100m;
```

The sample `docker/nginx.conf` in this repo does not set `client_max_body_size`, so nginx’s default (**1m**) will reject larger zip uploads. Set the directive on the jdtest / production gateway (or in that sample config) to match the app ceiling.
