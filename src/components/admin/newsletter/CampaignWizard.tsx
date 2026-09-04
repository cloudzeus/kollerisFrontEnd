"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Monitor, Save, Smartphone } from "lucide-react";
import { StepRail, EmailPreview, type StepDef } from "./WizardShell";
import { ProductPicker } from "./ProductPicker";
import { RecipientPicker, type RecipientChoice } from "./RecipientPicker";
import {
  previewCampaignAction,
  saveCampaignAction,
} from "@/lib/newsletter/campaign-actions";
import type { PickedProduct, TemplateMeta } from "@/lib/newsletter/campaign";
import { cn } from "@/lib/utils";

const STEPS: StepDef[] = [
  { id: "template", label: "Πρότυπο", hint: "Τι είδους email" },
  { id: "content", label: "Περιεχόμενο", hint: "Κείμενο και προϊόντα" },
  { id: "recipients", label: "Παραλήπτες", hint: "Σε ποιους" },
  { id: "review", label: "Έλεγχος", hint: "Προεπισκόπηση και αποστολή" },
];

/**
 * Ο wizard καμπάνιας.
 *
 * ── Γιατί η προεπισκόπηση είναι διαρκώς παρούσα ────────────────────────────
 *
 * Επειδή κανείς δεν μπορεί να φανταστεί ένα email από ένα πλέγμα πεδίων. Η
 * προεπισκόπηση δεν είναι βήμα στο τέλος· είναι η δεξιά στήλη σε κάθε βήμα, και
 * ενημερώνεται καθώς γράφεις. Η διαφορά στη χρήση είναι ότι διορθώνεις τη
 * διατύπωση ΤΩΡΑ, αντί να φτάσεις στο τέλος και να γυρίσεις πίσω.
 *
 * Περνά από τον ίδιο δρόμο με την αποστολή, οπότε ό,τι βλέπεις είναι ό,τι
 * φεύγει — προεπισκόπηση που ζει σε δικό της μονοπάτι είναι χειρότερη από
 * καθόλου, γιατί την εμπιστεύεσαι.
 */
export function CampaignWizard({
  templates,
  confirmedCount,
}: {
  templates: TemplateMeta[];
  confirmedCount: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);

  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [campaign, setCampaign] = useState({
    eyebrow: "",
    discount: "",
    title: "",
    text: "",
    url: "",
    valid_until: "",
  });
  const [products, setProducts] = useState<PickedProduct[]>([]);
  const [recipients, setRecipients] = useState<RecipientChoice>({ mode: "subscribers" });

  const [html, setHtml] = useState("");
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  /** Επιλογή προτύπου: γεμίζει θέμα και preheader από το ίδιο το πρότυπο. */
  const chooseTemplate = (t: TemplateMeta) => {
    setTemplateId(t.id);
    setSubject((s) => s || t.subject);
    setPreheader((p) => p || t.preheader);
    setName((n) => n || t.name);
  };

  const payload = useMemo(
    () => ({ campaign, products, bodyHtml: "" }),
    [campaign, products],
  );

  const refresh = useCallback(() => {
    if (!templateId) return;
    startPreview(async () => {
      try {
        setHtml(await previewCampaignAction({ templateId, payload }));
      } catch {
        setHtml("<p style='font:14px sans-serif;color:#c00;padding:24px'>Η προεπισκόπηση απέτυχε.</p>");
      }
    });
  }, [templateId, payload]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(refresh, 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [refresh]);

  const go = (next: number) => {
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  };

  const canAdvance =
    step === 0 ? Boolean(templateId) : step === 1 ? subject.trim().length > 0 : true;

  const audienceLabel =
    recipients.mode === "upload"
      ? `${recipients.rows.length} από ανεβασμένη λίστα`
      : recipients.onlyIds?.length
        ? `${recipients.onlyIds.length} επιλεγμένοι συνδρομητές`
        : "όλοι οι επιβεβαιωμένοι συνδρομητές";

  const save = () => {
    setError("");
    startSave(async () => {
      const res = await saveCampaignAction({ name, templateId, subject, preheader, payload });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/newsletter");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <StepRail steps={STEPS} current={step} furthest={furthest} onJump={setStep} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        {/* ── Χειριστήρια ─────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          {step === 0 && (
            <section className="space-y-3">
              <p className="text-[13px] text-neutral-600">
                Μόνο τα πρότυπα newsletter εμφανίζονται εδώ. Τα υπόλοιπα 21 τα ενεργοποιεί μια
                παραγγελία ή μια εγγραφή και δεν στέλνονται μαζικά.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => chooseTemplate(t)}
                    className={cn(
                      "border p-4 text-left transition-colors",
                      templateId === t.id
                        ? "border-neutral-900 ring-1 ring-neutral-900"
                        : "border-neutral-200 bg-white hover:border-neutral-400",
                    )}
                  >
                    <p className="font-mono text-[10px] tracking-wide text-neutral-500 uppercase">
                      {t.id}
                    </p>
                    <p className="mt-1 text-[14px] font-semibold">{t.name}</p>
                    <p className="mt-1.5 line-clamp-2 text-[12px] text-neutral-600">{t.subject}</p>
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {t.takesProducts && (
                        <span className="bg-neutral-100 px-1.5 py-0.5 text-[10px]">προϊόντα</span>
                      )}
                      {t.takesRichText && (
                        <span className="bg-neutral-100 px-1.5 py-0.5 text-[10px]">κείμενο</span>
                      )}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && template && (
            <section className="space-y-4">
              <div className="grid gap-3 border border-neutral-200 bg-white p-4 sm:grid-cols-2">
                <Field label="Όνομα καμπάνιας" hint="Μόνο για εσάς — δεν φαίνεται στον παραλήπτη.">
                  <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
                </Field>
                <Field
                  label="Θέμα email"
                  hint={`${subject.length} χαρακτήρες — τα κινητά κόβουν γύρω στους 40.`}
                >
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field
                  label="Preheader"
                  hint="Η γραμμή δίπλα στο θέμα στα εισερχόμενα. Αν μείνει κενή, ο πελάτης βλέπει την αρχή του email."
                >
                  <input
                    value={preheader}
                    onChange={(e) => setPreheader(e.target.value)}
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="grid gap-3 border border-neutral-200 bg-white p-4 sm:grid-cols-2">
                <Field label="Επικεφαλίδα" hint="π.χ. «Προσφορές Σεπτεμβρίου / 01–30.09»">
                  <input
                    value={campaign.eyebrow}
                    onChange={(e) => setCampaign({ ...campaign, eyebrow: e.target.value })}
                    className={INPUT}
                  />
                </Field>
                <Field label="Ποσοστό" hint="Μπαίνει μεγάλο στο κόκκινο πλαίσιο, π.χ. «−25%».">
                  <input
                    value={campaign.discount}
                    onChange={(e) => setCampaign({ ...campaign, discount: e.target.value })}
                    className={INPUT}
                  />
                </Field>
                <Field label="Τίτλος">
                  <input
                    value={campaign.title}
                    onChange={(e) => setCampaign({ ...campaign, title: e.target.value })}
                    className={INPUT}
                  />
                </Field>
                <Field label="Ισχύει έως">
                  <input
                    value={campaign.valid_until}
                    onChange={(e) => setCampaign({ ...campaign, valid_until: e.target.value })}
                    placeholder="30.09.2026"
                    className={INPUT}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Κείμενο">
                    <textarea
                      rows={3}
                      value={campaign.text}
                      onChange={(e) => setCampaign({ ...campaign, text: e.target.value })}
                      className={cn(INPUT, "h-auto py-2")}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Σύνδεσμος κουμπιού" hint="Πού πάει το «Δείτε τις προσφορές».">
                    <input
                      value={campaign.url}
                      onChange={(e) => setCampaign({ ...campaign, url: e.target.value })}
                      placeholder="https://web.kolleris.com/prosfores"
                      className={INPUT}
                    />
                  </Field>
                </div>
              </div>

              {template.takesProducts && (
                <div className="border border-neutral-200 bg-white p-4">
                  <ProductPicker selected={products} onChange={setProducts} />
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <RecipientPicker
                confirmedCount={confirmedCount}
                value={recipients}
                onChange={setRecipients}
              />
            </section>
          )}

          {step === 3 && (
            <section className="space-y-3 border border-neutral-200 bg-white p-4">
              <Row label="Πρότυπο" value={template?.name ?? "—"} />
              <Row label="Θέμα" value={subject || "—"} />
              <Row label="Προϊόντα" value={products.length ? `${products.length}` : "κανένα"} />
              <Row label="Παραλήπτες" value={audienceLabel} />
              <p className="border-t border-neutral-100 pt-3 text-[12px] leading-relaxed text-neutral-600">
                Η αποστολή δεν είναι ακόμη ενεργή — έρχεται με το επόμενο βήμα, μαζί με την
                αναφορά παραδόσεων και ανοιγμάτων. Μέχρι τότε η καμπάνια αποθηκεύεται ως πρόχειρη
                και μπορείτε να τη συνεχίσετε.
              </p>
              {error && <p className="text-[12px] text-red-600">{error}</p>}
            </section>
          )}
        </div>

        {/* ── Προεπισκόπηση ───────────────────────────────────── */}
        <div className="min-w-0">
          <div className="sticky top-4">
            <div className="flex items-center justify-between border border-b-0 border-neutral-200 bg-white px-3 py-2">
              <p className="text-[12px] font-semibold">Προεπισκόπηση</p>
              <div className="flex gap-px bg-neutral-200">
                {(
                  [
                    ["desktop", Monitor, "Υπολογιστής"],
                    ["mobile", Smartphone, "Κινητό"],
                  ] as const
                ).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewWidth(mode)}
                    aria-label={label}
                    aria-pressed={previewWidth === mode}
                    className={cn(
                      "px-2 py-1",
                      previewWidth === mode ? "bg-neutral-900 text-white" : "bg-white text-neutral-500",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-neutral-200">
              <EmailPreview html={html} width={previewWidth} loading={previewing} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Πλοήγηση ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={() => go(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex h-9 items-center gap-1.5 px-3 text-[13px] font-medium text-neutral-600 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Πίσω
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !templateId || !name.trim()}
            className="inline-flex h-9 items-center gap-1.5 border border-neutral-300 px-4 text-[13px] font-medium disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {saving ? "Αποθήκευση…" : "Αποθήκευση πρόχειρου"}
          </button>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => go(step + 1)}
              disabled={!canAdvance}
              className="inline-flex h-9 items-center gap-1.5 bg-neutral-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
            >
              Συνέχεια <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "h-9 w-full border border-neutral-300 px-2.5 text-[13px] outline-none focus:border-neutral-900";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-[13px]">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
