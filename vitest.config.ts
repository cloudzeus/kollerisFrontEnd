import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws on import outside a React Server Component, which
      // is exactly what a unit test is. Stubbed so server modules stay testable
      // without dropping the guard that keeps them off the client.
      "server-only": path.resolve(__dirname, "./src/lib/__tests__/server-only.stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
