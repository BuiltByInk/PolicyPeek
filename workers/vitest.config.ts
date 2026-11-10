import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["outreach/test/**/*.test.ts", "outreach-reply/test/**/*.test.ts", "policy-watcher/test/**/*.test.ts"] } });
