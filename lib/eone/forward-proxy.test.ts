import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyIncoming,
  filterRequestHeaders,
  filterResponseHeaders,
} from "./forward-proxy.ts";

test("absolute http URL forwards path and query", () => {
  assert.deepEqual(
    classifyIncoming("GET", "http://hijack.example/a.js?x=1"),
    { action: "forward", pathAndQuery: "/a.js?x=1" },
  );
});

test("absolute http origin with no path forwards slash", () => {
  assert.deepEqual(classifyIncoming("GET", "http://hijack.example"), {
    action: "forward",
    pathAndQuery: "/",
  });
});

test("origin-form passes through", () => {
  assert.deepEqual(classifyIncoming("GET", "/__eone/admin"), {
    action: "forward",
    pathAndQuery: "/__eone/admin",
  });
});

test("CONNECT is rejected", () => {
  assert.deepEqual(classifyIncoming("CONNECT", "hijack.example:443"), {
    action: "reject",
    status: 405,
  });
});

test("https absolute URL is rejected", () => {
  assert.deepEqual(classifyIncoming("GET", "https://hijack.example/x"), {
    action: "reject",
    status: 400,
  });
});

test("drops cookie and hop-by-hop, keeps X-Eone-Id", () => {
  const out = filterRequestHeaders({
    cookie: "sid=1",
    authorization: "Bearer x",
    "proxy-authorization": "Basic x",
    connection: "keep-alive",
    "x-eone-id": "eone-1",
    swimlane: "eone-1",
    accept: "*/*",
  });
  assert.equal(out.cookie, undefined);
  assert.equal(out.authorization, undefined);
  assert.equal(out["proxy-authorization"], undefined);
  assert.equal(out.connection, undefined);
  assert.equal(out["x-eone-id"], "eone-1");
  assert.equal(out.swimlane, "eone-1");
  assert.equal(out.accept, "*/*");
});

test("response filter drops hop-by-hop", () => {
  const out = filterResponseHeaders({
    "content-type": "text/plain",
    connection: "close",
    "transfer-encoding": "chunked",
  });
  assert.equal(out["content-type"], "text/plain");
  assert.equal(out.connection, undefined);
  assert.equal(out["transfer-encoding"], undefined);
});
