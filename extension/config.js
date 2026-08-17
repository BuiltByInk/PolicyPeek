// Single place the API target lives -- swap this one line when a deployed
// Worker URL exists (deployment is deliberately parked per CLAUDE.md as of
// this scaffold; see extension/SCOPE.md's "API target" decision). Also
// update manifest.json's host_permissions entry to match, since MV3 only
// bypasses CORS for origins declared there.
export const API_BASE_URL = "http://localhost:8787";
