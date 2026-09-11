import { prisma } from "../src/lib/prisma"

/**
 * Βγάζει τον ΦΠΑ από τις αποθηκευμένες τιμές, μία φορά.
 *
 * Τρέχει ΜΕΤΑ το deploy του νέου συγχρονισμού. Πριν από αυτό, ο συγχρονισμός
 * θα ξανάγραφε τη μεικτή τιμή μέσα στο λεπτό.
 */
const DEFAULT_VAT = 24
const round4 = (n: number) => Math.round(n * 10000) / 10000

async function main() {
  const dry = process.argv.includes("--dry")
  const rows = await prisma.product.findMany({
    where: { priceNet: { not: null } },
    select: { id: true, code: true, priceNet: true, vatRate: true },
  })

  let changed = 0
  let already = 0
  const sample: string[] = []

  for (const r of rows) {
    const stored = Number(r.priceNet)
    const vat = Number(r.vatRate ?? 0) || DEFAULT_VAT
    const net = round4(stored / (1 + vat / 100))
    if (Math.abs(net - stored) < 0.00005) { already++; continue }
    if (sample.length < 5) sample.push(`${r.code}: ${stored} → ${net} (ΦΠΑ ${vat}%)`)
    if (!dry) await prisma.product.update({ where: { id: r.id }, data: { priceNet: net } })
    changed++
  }

  console.log(`${dry ? "ΔΟΚΙΜΗ · " : ""}ΠΡΟΪΟΝΤΑ ${rows.length} · άλλαξαν ${changed} · ήταν ήδη καθαρά ${already}`)
  for (const s of sample) console.log("  " + s)
}
main().catch(e => console.log("ΣΦΑΛΜΑ " + e.message)).finally(() => process.exit(0))
