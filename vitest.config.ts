import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Match the "@/*" path alias from tsconfig.json.
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
