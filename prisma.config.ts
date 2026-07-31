import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env. Next.js loads it for the app; the CLI
// needs it explicitly. `loadEnvFile` is a no-op-safe read (Node >= 20.6).
try {
  process.loadEnvFile(".env");
} catch {
  // .env absent (CI / production): rely on real environment variables.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
