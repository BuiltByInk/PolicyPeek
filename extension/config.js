// Single place the API target lives. Updated 2026-09-17: the Worker is
// deployed and live at api.getpolicypeek.com (Phase 3 launch) -- see
// extension/SCOPE.md's "API target" decision, now resolved. manifest.json's
// host_permissions updated to match in the same pass, since MV3 only
// bypasses CORS for origins declared there.
export const API_BASE_URL = "https://api.getpolicypeek.com";
