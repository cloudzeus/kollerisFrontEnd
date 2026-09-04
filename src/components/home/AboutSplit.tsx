import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Η ενότητα «η εταιρεία» στην αρχική: εικόνα αριστερά, ισχυρισμοί δεξιά.
 *
 * ── Τι ήταν εδώ ────────────────────────────────────────────────────────────
 *
 * Ένα ριγέ πλακίδιο που έγραφε «ΦΩΤΟΓΡΑΦΙΑ ΑΠΟΘΗΚΗΣ / ΟΜΑΔΑΣ 1200 × 840» —
 * κράτηση θέσης για υλικό που δεν είχε έρθει. Ήρθε.
 *
 * ── Γιατί υπάρχει overlay ──────────────────────────────────────────────────
 *
 * Η φωτογραφία είναι σκούρα αλλά η πρόσοψη του κτηρίου φωτεινή, και το κείμενο
 * περνά ακριβώς από πάνω της. Χωρίς βαθμωτό σκίαστρο, μισή λέξη διαβάζεται και
 * η άλλη μισή χάνεται — και όχι σταθερά, αλλά ανάλογα με το πού κόβει το
 * `object-cover` σε κάθε πλάτος οθόνης. Το σκίαστρο σβήνει από διάφανο ψηλά σε
 * σχεδόν αδιαφανές κάτω, όπου κάθεται το κείμενο.
 *
 * ── Το λογότυπο δεν επαναχρωματίζεται ──────────────────────────────────────
 *
 * Η negative παραλλαγή κρατά το σήμα στο δικό του κόκκινο και γυρίζει μόνο το
 * λεκτικό σε λευκό — η καθιερωμένη knockout εκδοχή για σκούρο φόντο, όχι
 * φίλτρο πάνω στο σήμα.
 *
 * ── Φαίνεται και σε κινητό ─────────────────────────────────────────────────
 *
 * Πριν κρυβόταν κάτω από 1024px, και σωστά: ένα πλακίδιο κράτησης θέσης δεν
 * αξίζει 420px στο κινητό. Τώρα κουβαλά μήνυμα, οπότε μένει — χαμηλότερο.
 */
export function AboutSplit({
  usps,
  copy
}: {
  usps: Array<{ n: string; title: string; body: string }>;
  copy: Record<string, string>
}) {
  const t = useTranslations("home.AboutSplit");
  return (
    <section className="shell-w grid bg-white lg:grid-cols-2">
      <div className="relative flex min-h-[280px] items-end overflow-hidden bg-k-ink-deep lg:min-h-[420px]">
        <Image
          src="https://kolleris.b-cdn.net/eshop/library/final-crop-1788535746009.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />

        {/* Το σκίαστρο. Διάφανο ψηλά, σχεδόν αδιαφανές εκεί που πέφτει το κείμενο. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(177deg,rgba(16,17,19,0)_0%,rgba(16,17,19,0.35)_42%,rgba(16,17,19,0.86)_78%,rgba(16,17,19,0.96)_100%)]"
        />

        <div className="relative flex w-full flex-col gap-4 p-6 lg:gap-5 lg:p-10">
          <Image
            src="/brand/kolleris-logo-negative.svg"
            alt="Kolleris"
            width={280}
            height={117}
            className="h-9 w-auto self-start lg:h-11"
          />

          <p className="t-eyebrow text-k-red">{upGreek(t("apo_to_1978"))}</p>

          <p className="font-display t-display text-[26px] leading-[1.04] text-white lg:text-[34px]">
            {upGreek(t("motto_line1"))}
            <br />
            <span className="text-k-red">{upGreek(t("motto_line2"))}</span>
          </p>

          <p className="max-w-[42ch] text-[13px] leading-[1.6] text-white/70 lg:text-sm">
            {t("motto_lead")}
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-4 px-4 py-7 lg:gap-[22px] lg:px-14 lg:py-16">
        <p className="t-eyebrow text-k-red">{upGreek(copy.eyebrow)}</p>
        <h2 className="t-h2-about text-k-ink">
          {upGreek(copy.title)}
          <br />
          {upGreek(copy.titleSecond)}
        </h2>
        <p className="t-body text-k-text-2">
          {t("gia_46_chronia_i_kolleris")}
        </p>

        <dl className="mt-1 flex flex-col gap-3.5">
          {usps.map((usp) => (
            <div key={usp.n} className="flex gap-3.5 border-t border-k-line pt-3.5">
              <span className="t-cat-num mt-[3px] text-k-red">{usp.n}</span>
              <div>
                <dt className="t-usp-title text-k-ink">{usp.title}</dt>
                <dd className="t-usp-body mt-1 text-k-text-3">{usp.body}</dd>
              </div>
            </div>
          ))}
        </dl>

        <Link
          href="/etaireia"
          className="t-btn-sm mt-2 self-start bg-k-ink px-[30px] py-[15px] text-white transition-colors hover:bg-k-red"
        >
          {upGreek(copy.cta)} →
        </Link>
      </div>
    </section>
  );
}
