import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createOuterServer } from "./forward-proxy.ts";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("no port"));
    });
    server.on("error", reject);
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function request(
  port: number,
  options: http.RequestOptions,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, ...options }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

test("absolute-form GET forwards path without cookie", async () => {
  const seen: { url?: string; cookie?: string; eone?: string; host?: string }[] =
    [];
  const upstream = http.createServer((req, res) => {
    seen.push({
      url: req.url,
      cookie: req.headers.cookie,
      eone: req.headers["x-eone-id"],
      host: req.headers.host,
    });
    res.setHeader("Content-Type", "text/plain");
    res.end("ok");
  });
  const upPort = await listen(upstream);
  const outer = createOuterServer({
    upstreamHost: "127.0.0.1",
    upstreamPort: upPort,
  });
  const outerPort = await listen(outer);
  try {
    const res = await request(outerPort, {
      method: "GET",
      path: "http://hijack.example/a.js?x=1",
      headers: {
        Host: "hijack.example",
        Cookie: "sid=1",
        "X-Eone-Id": "eone-1",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, "ok");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.url, "/a.js?x=1");
    assert.equal(seen[0]?.cookie, undefined);
    assert.equal(seen[0]?.eone, "eone-1");
    assert.equal(seen[0]?.host, `127.0.0.1:${upPort}`);
  } finally {
    await close(outer);
    await close(upstream);
  }
});

test("origin-form GET passes path through", async () => {
  const seen: string[] = [];
  const upstream = http.createServer((req, res) => {
    seen.push(req.url ?? "");
    res.end("guide");
  });
  const upPort = await listen(upstream);
  const outer = createOuterServer({
    upstreamHost: "127.0.0.1",
    upstreamPort: upPort,
  });
  const outerPort = await listen(outer);
  try {
    const res = await request(outerPort, { method: "GET", path: "/" });
    assert.equal(res.status, 200);
    assert.equal(res.body, "guide");
    assert.deepEqual(seen, ["/"]);
  } finally {
    await close(outer);
    await close(upstream);
  }
});
