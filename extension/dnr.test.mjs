import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ORIGIN,
  DNR_RULE_ID,
  DNR_SWIMLANE_RULE_ID,
  EONE_HEADER_NAME,
  LOCAL_PROXY_PORT,
  PLATFORM_PROXY,
  RESOURCE_TYPES,
  SWIMLANE_HEADER_NAME,
  buildDnrRule,
  buildDnrRules,
  buildPacScript,
  hijackCollidesWithPlatform,
  hostPermissionPattern,
  normalizeHijackOrigin,
  normalizeOrigin,
  originToRegexFilter,
  pacDecision,
  requiredHostPermissions,
  shouldSkipPac,
} from "./dnr.mjs";

test("normalizeOrigin strips path and trailing slash", () => {
  assert.equal(normalizeOrigin("http://localhost:3000/foo"), "http://localhost:3000");
});

test("normalizeOrigin rejects non-http", () => {
  assert.throws(() => normalizeOrigin("ftp://localhost"));
});

test("empty id yields null rule", () => {
  assert.equal(buildDnrRule({ origin: "http://localhost:3000", id: "" }), null);
});

test("builds a single modifyHeaders rule", () => {
  const rule = buildDnrRule({ origin: "http://localhost:3000", id: "eone-1" });
  assert.equal(rule.id, DNR_RULE_ID);
  assert.equal(rule.action.type, "modifyHeaders");
  assert.deepEqual(rule.action.requestHeaders, [
    { header: EONE_HEADER_NAME, operation: "set", value: "eone-1" },
  ]);
  assert.equal(rule.condition.regexFilter, originToRegexFilter("http://localhost:3000"));
  assert.deepEqual(rule.condition.resourceTypes, RESOURCE_TYPES);
});

test("regex does not match a longer port", () => {
  const filter = originToRegexFilter("http://localhost:3000");
  const re = new RegExp(filter);
  assert.equal(re.test("http://localhost:3000"), true);
  assert.equal(re.test("http://localhost:3000/"), true);
  assert.equal(re.test("http://localhost:3000/index.js"), true);
  assert.equal(re.test("http://localhost:30000/"), false);
});

test("host permission pattern", () => {
  assert.equal(
    hostPermissionPattern("http://localhost:3000"),
    "http://localhost:3000/*",
  );
});

test("required host permissions include all http(s) hosts for API Swimlane", () => {
  assert.deepEqual(requiredHostPermissions("http://localhost:3000/guide"), [
    "http://localhost:3000/*",
    "http://*/*",
    "https://*/*",
  ]);
});

test("empty id yields no rules", () => {
  assert.deepEqual(buildDnrRules({ origin: "http://localhost:3000", id: "" }), []);
});

test("builds X-Eone-Id and Swimlane xmlhttprequest rules", () => {
  const rules = buildDnrRules({
    origin: "http://jdcleaning-man-web-test.web.jdtest.net",
    id: "eone-577205",
  });
  assert.equal(rules.length, 2);

  const [originRule, swimlaneRule] = rules;
  assert.equal(originRule.id, DNR_RULE_ID);
  assert.deepEqual(originRule.action.requestHeaders, [
    { header: EONE_HEADER_NAME, operation: "set", value: "eone-577205" },
  ]);

  assert.equal(swimlaneRule.id, DNR_SWIMLANE_RULE_ID);
  assert.equal(swimlaneRule.action.type, "modifyHeaders");
  assert.deepEqual(swimlaneRule.action.requestHeaders, [
    { header: SWIMLANE_HEADER_NAME, operation: "set", value: "eone-577205" },
  ]);
  assert.deepEqual(swimlaneRule.condition.initiatorDomains, [
    "jdcleaning-man-web-test.web.jdtest.net",
  ]);
  assert.deepEqual(swimlaneRule.condition.resourceTypes, ["xmlhttprequest"]);
});

test("PLATFORM_PROXY is fixed remote :80", () => {
  assert.equal(PLATFORM_PROXY, "eone-router.jdtest.net:80");
  assert.equal(DEFAULT_ORIGIN, "http://localhost:3001");
  assert.equal(LOCAL_PROXY_PORT, 3001);
});

test("normalizeHijackOrigin rejects https", () => {
  assert.throws(() => normalizeHijackOrigin("https://xxx.jd.com"));
});

test("shouldSkipPac only when hijack is the platform", () => {
  assert.equal(shouldSkipPac("http://eone-router.jdtest.net"), true);
  assert.equal(shouldSkipPac("http://eone-router.jdtest.net:80/"), true);
  assert.equal(shouldSkipPac("http://xxx.jd.com"), false);
  assert.equal(shouldSkipPac("http://localhost:3001"), false);
});

test("pacDecision always uses remote PLATFORM_PROXY", () => {
  const origin = "http://xxx.jd.com:8080";
  assert.equal(
    pacDecision("http://xxx.jd.com:8080/app.js", origin),
    "PROXY eone-router.jdtest.net:80",
  );
  assert.equal(pacDecision("http://other.example/", origin), "DIRECT");
});

test("buildPacScript embeds fixed remote proxy", () => {
  const script = buildPacScript("http://xxx.jd.com");
  const fn = new Function(`${script}; return FindProxyForURL;`)();
  assert.equal(
    fn("http://xxx.jd.com/a", "xxx.jd.com"),
    "PROXY eone-router.jdtest.net:80",
  );
  assert.equal(fn("http://other.example/", "other.example"), "DIRECT");
});

test("hijackCollidesWithPlatform detects platform endpoint", () => {
  assert.equal(hijackCollidesWithPlatform("http://eone-router.jdtest.net"), true);
  assert.equal(
    hijackCollidesWithPlatform("http://EONE-Router.JDTest.net:80"),
    true,
  );
  assert.equal(hijackCollidesWithPlatform("http://xxx.jd.com"), false);
  assert.equal(hijackCollidesWithPlatform("http://127.0.0.1:3001"), false);
});
