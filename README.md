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

The sample `docker/nginx.conf` in this repo already sets `client_max_body_size 100m;`. Ensure the jdtest / production gateway uses the same limit if uploads fail with 413.

## Hijack / platform proxy

The Chrome extension PAC always targets **`eone-router.jdtest.net:80`**. Local loopback PAC (`127.0.0.1:3001`) is **not supported**.

nginx on `:80` forwards to the outer server on `127.0.0.1:3001` inside the container. After editing `docker/nginx.conf`, reload nginx on the host.
