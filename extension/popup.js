import { API_BASE_URL } from "./config.js";
import { BADGE_COPY, iconPathsFor } from "./badgeCopy.js";

const badgeEl = document.getElementById("badge");
const statusEl = document.getElementById("status");

function renderBadge(state, tooltip) {
  const copy = BADGE_COPY[state];
  badgeEl.textContent = copy.label;
  badgeEl.className = `badge ${copy.color} ${copy.shape}`;
  badgeEl.title = tooltip || copy.label;
}

// Only meaningful for the activeTab-granted tab -- setIcon/setTitle scoped
// to tabId so we never touch the toolbar's default state for other tabs.
function setTabIcon(tabId, state) {
  chrome.action.setIcon({ tabId, path: iconPathsFor(state) });
  chrome.action.setTitle({ tabId, title: BADGE_COPY[state].label });
}

function showMessage(text) {
  statusEl.textContent = text;
}

// Short-TTL cache so reopening the popup on the same tab (e.g. after an SPA
// route change within the same domain) doesn't necessarily refetch --
// exact invalidation strategy flagged as an implementation detail in
// SCOPE.md, this is that detail. Session-only would also be defensible;
// TTL was picked so a stale "not in catalog" doesn't linger too long after
// a submission gets approved.
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCachedLookup(hostname) {
  const key = `lookup:${hostname}`;
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry;
  return null;
}

async function setCachedLookup(hostname, entry) {
  const key = `lookup:${hostname}`;
  await chrome.storage.local.set({ [key]: { ...entry, ts: Date.now() } });
}

async function getHostnameForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return null;
  }
  // Excludes chrome://, about:, file://, the new-tab page, etc. -- nothing
  // to check there, and no point sending them to the backend as "domains".
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  return { tab, hostname: url.hostname };
}

function applyLookupResult(tab, hostname, state, { name, summary } = {}) {
  if (state === "not_in_catalog") {
    renderBadge("not_in_catalog");
    setTabIcon(tab.id, "not_in_catalog");
    showMessage(`${hostname} isn't in the catalog yet.`);
    return;
  }

  renderBadge(state, summary || undefined);
  setTabIcon(tab.id, state);
  showMessage(name ? `${name} — ${hostname}` : hostname);
}

async function runLookup(tab, hostname) {
  const cached = await getCachedLookup(hostname);
  if (cached) {
    applyLookupResult(tab, hostname, cached.state, cached);
    return;
  }

  renderBadge("loading");
  setTabIcon(tab.id, "loading");
  showMessage("Checking…");

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/v1/lookup?domain=${encodeURIComponent(hostname)}`);
  } catch {
    showMessage("Couldn't reach PolicyPeek. Is the local backend running?");
    return;
  }

  if (res.status === 404) {
    await setCachedLookup(hostname, { state: "not_in_catalog" });
    applyLookupResult(tab, hostname, "not_in_catalog");
    return;
  }

  if (!res.ok) {
    showMessage("Something went wrong looking this up.");
    return;
  }

  const data = await res.json();
  const state = data.compliance_status;
  if (!BADGE_COPY[state]) {
    showMessage("Unexpected response from PolicyPeek.");
    return;
  }

  await setCachedLookup(hostname, { state, name: data.name, summary: data.summary });
  applyLookupResult(tab, hostname, state, data);
}

(async function init() {
  const result = await getHostnameForActiveTab();
  if (!result) {
    badgeEl.textContent = "—";
    badgeEl.className = "badge gray solid";
    showMessage("PolicyPeek can't check this page.");
    return;
  }

  await runLookup(result.tab, result.hostname);
})();
