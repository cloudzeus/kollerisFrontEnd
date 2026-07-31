import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // rely on real environment variables
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Seeds the first ADMIN account and the sync channel rows.
 *
 * Password comes from SEED_ADMIN_PASSWORD — never hardcode one, or every
 * deployment ships with the same known credential.
 */
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || password.length < 12) {
    throw new Error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 12 chars) before seeding.",
    );
  }

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { role: "ADMIN", isActive: true },
    create: {
      email,
      name: process.env.SEED_ADMIN_NAME ?? null,
      passwordHash: await hash(password),
      role: "ADMIN",
    },
  });
  console.log(`✓ admin: ${admin.email} (${admin.role})`);

  for (const channel of ["catalog-delta", "catalog-snapshot", "pricing"]) {
    await prisma.syncState.upsert({
      where: { channel },
      update: {},
      create: { channel },
    });
  }
  console.log("✓ sync channels: catalog-delta, catalog-snapshot, pricing");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
