// Self-check for the frontend audit waiver (run by predeploy-check.mjs, so CI
// runs it too). Fixture: real `npm audit --json` output from 18 Nov 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateAudit, WAIVER } from "./audit-frontend.mjs";

const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/audit-frontend-2026-11-18.json", import.meta.url), "utf8"));
const BEFORE = new Date("2026-11-18T09:00:00Z");

test("today's report passes only because of GHSA-fc5q-39xc-vjpf", () => {
  const r = evaluateAudit(fixture(), BEFORE);
  assert.equal(r.ok, true, JSON.stringify(r.failures));
  assert.equal(r.waived.length, 10);
});

test("the waiver expires: on and after 2 Dec 2026 the same report fails", () => {
  for (const t of ["2026-12-02T00:00:00Z", "2026-12-15T12:00:00Z"]) {
    const r = evaluateAudit(fixture(), new Date(t));
    assert.equal(r.ok, false);
    assert.equal(r.failures.length, 10);
  }
  assert.equal(evaluateAudit(fixture(), new Date("2026-12-01T23:59:59Z")).ok, true);
});

test("any other advisory still fails, at any severity", () => {
  for (const severity of ["info", "low", "moderate", "high", "critical"]) {
    const rep = fixture();
    rep.vulnerabilities["left-pad"] = { name: "left-pad", severity, via: [{ source: 1, name: "left-pad", url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz", severity }] };
    const r = evaluateAudit(rep, BEFORE);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failures.map((f) => f.name), ["left-pad"]);
  }
});

test("a different advisory on picomatch itself fails", () => {
  const rep = fixture();
  rep.vulnerabilities.picomatch.via.push({ source: 2, name: "picomatch", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "low" });
  const r = evaluateAudit(rep, BEFORE);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.name === "picomatch"));
});

test("a named chain package with its own new advisory fails", () => {
  const rep = fixture();
  rep.vulnerabilities.vite.via.push({ source: 3, name: "vite", url: "https://github.com/advisories/GHSA-dddd-eeee-ffff", severity: "moderate" });
  const r = evaluateAudit(rep, BEFORE);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.name === "vite"));
  assert.ok(r.failures.some((f) => f.name === "astro"), "astro depends on vite, so it is no longer covered");
});

test("an unnamed package flagged via picomatch fails", () => {
  const rep = fixture();
  rep.vulnerabilities["micromatch"] = { name: "micromatch", severity: "high", via: ["picomatch"] };
  const r = evaluateAudit(rep, BEFORE);
  assert.equal(r.ok, false);
  assert.deepEqual(r.failures.map((f) => f.name), ["micromatch"]);
});

test("the waiver names exactly one GHSA and package", () => {
  assert.equal(WAIVER.ghsa, "GHSA-fc5q-39xc-vjpf");
  assert.equal(WAIVER.advisoryPackage, "picomatch");
  assert.equal(WAIVER.expires, "2026-12-02T00:00:00Z");
});

test("an empty report passes", () => {
  assert.equal(evaluateAudit({ vulnerabilities: {} }, BEFORE).ok, true);
});
