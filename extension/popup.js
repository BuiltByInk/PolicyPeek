import { API_BASE_URL } from "./config.js";
import { BADGE_COPY, iconPathsFor } from "./badgeCopy.js";

const badgeEl = document.getElementById("badge");
const statusEl = document.getElementById("status");
const actionsEl = document.getElementById("actions");

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

function clearActions() {
  actionsEl.replaceChildren();
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

function describeCheckError(status, error, reason) {
  const known = {
    invalid_domain: "That domain doesn't look valid.",
    missing_source_url: "Missing the page URL to submit.",
    invalid_source_url: "That page URL doesn't look valid.",
    source_url_domain_mismatch: "The current page isn't on this domain.",
    blocked_url: `That URL can't be fetched${reason ? `: ${reason}` : "."}`,
    fetch_failed: `Couldn't fetch that page${reason ? `: ${reason}` : "."}`,
    insert_failed: "Something went wrong saving this check.",
  };
  return known[error] || `Something went wrong (status ${status}).`;
}

function renderCheckButton(tab, hostname) {
  clearActions();

  const button = document.createElement("button");
  button.textContent = "Check this site";
  button.addEventListener("click", () => submitCheck(tab, hostname, button));
  actionsEl.appendChild(button);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "For best results, click this from the site's privacy policy page.";
  actionsEl.appendChild(hint);
}

// Submits the CURRENT tab's own URL as source_url, not a discovered policy
// link (out of MVP scope per SCOPE.md's "Non-goals") -- this also happens
// to be exactly what isSourceHostAllowedForDomain requires (source_url's
// host must equal or be a real subdomain of domain), so no extra
// client-side validation is needed to satisfy that check.
async function submitCheck(tab, hostname, button) {
  button.disabled = true;
  button.textContent = "Submitting…";

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/v1/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: hostname, source_url: tab.url }),
    });
  } catch {
    clearActions();
    showMessage("Couldn't reach PolicyPeek to submit this check.");
    return;
  }

  const data = await res.json().catch(() => ({}));
  clearActions();

  // 202: queued. No polling here on purpose -- v1 shows one static message
  // and stops; the pending check goes through the existing human review
  // gate before it ever becomes a real badge.
  if (res.status === 202) {
    showMessage("Submitted! This goes to review — check back later for a verdict.");
    return;
  }

  if (res.status === 429) {
    const resetText = data.resets_at
      ? ` It resets ${new Date(data.resets_at).toLocaleString()}.`
      : "";
    showMessage(`You've already used today's free check.${resetText}`);
    return;
  }

  showMessage(describeCheckError(res.status, data.error, data.reason));
}

function applyLookupResult(tab, hostname, state, { name, summary } = {}) {
  if (state === "not_in_catalog") {
    renderBadge("not_in_catalog");
    setTabIcon(tab.id, "not_in_catalog");
    showMessage(`${hostname} isn't in the catalog yet.`);
    renderCheckButton(tab, hostname);
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
  clearActions();

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/v1/lookup?domain=${encodeURIComponent(hostname)}`);
  } catch {
    showMessage("Couldn't reach PolicyPeek. Try again in a moment.");
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
