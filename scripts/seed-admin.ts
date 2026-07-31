import { hash } from "@node-rs/argon2";
import { prisma } from "../src/lib/prisma";

const EMAIL = "gkozyris@i4ria.com";

async function main() {
  const existing = await prisma.adminUser.findMany({ select: { email: true, role: true, isActive: true } });
  console.log("  υπάρχοντες admins:", existing.length ? existing.map(a => `${a.email} (${a.role})`).join(", ") : "κανένας");

  // Ίδιες παράμετροι με τον verifier του auth.ts (argon2id, m=19456 t=2 p=1).
  const passwordHash = await hash(process.env.ADMIN_PASSWORD!, {
    memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32,
  });

  const user = await prisma.adminUser.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: "Γιώργος Κοζύρης", passwordHash, role: "ADMIN", isActive: true },
    update: { passwordHash, role: "ADMIN", isActive: true },
    select: { id: true, email: true, role: true, isActive: true, createdAt: true },
  });
  console.log(`  ✅ ${user.email} · ${user.role} · ενεργός=${user.isActive}`);
}
main().catch(e => { console.error("❌", e.message); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
