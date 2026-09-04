"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, useTransition } from "react";
import { GripVertical, Plus, Search, X } from "lucide-react";
import {
  searchNewsSourcesAction,
  type NewsSource,
} from "@/lib/newsletter/campaign-actions";
import type { NewsArticle, NewsContent } from "@/lib/newsletter/copy";
import { cn } from "@/lib/utils";

/**
 * Το περιεχόμενο του newsletter «Νέα» — ορατό και ξαναγράψιμο.
 *
 * ── Γιατί μπλοκ και όχι ένα μεγάλο κουτί κειμένου ─────────────────────────
 *
 * Επειδή έτσι είναι φτιαγμένο το πρότυπο: κάθε άρθρο παίρνει δική του εικόνα,
 * ετικέτα και κουμπί, μέσα σε πίνακα που το Outlook αποδίδει σωστά. Ένα κουτί
 * ελεύθερου κειμένου θα έδινε στον συντάκτη ελευθερία που το email δεν μπορεί
 * να τιμήσει — και το αποτέλεσμα θα φαινόταν σωστό στην προεπισκόπηση και
 * διαλυμένο στα μισά γραμματοκιβώτια.
 *
 * Μέσα στα κείμενα επιτρέπονται <strong>, <em> και σύνδεσμοι. Τίποτα άλλο δεν
 * επιβιώνει του καθαριστή, και αυτό είναι σκόπιμο.
 */

const INPUT =
  "h-9 w-full border border-neutral-300 px-2.5 text-[13px] outline-none focus:border-neutral-900";
const AREA =
  "w-full border border-neutral-300 p-2.5 text-[13px] leading-relaxed outline-none focus:border-neutral-900";

function ArticleCard({
  article,
  index,
  onChange,
  onRemove,
}: {
  article: NewsArticle;
  index: number;
  onChange: (next: NewsArticle) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: article.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("border border-neutral-200 bg-white", isDragging && "z-10 shadow-lg")}
    >
      <div className="flex items-center gap-2 border-b border-neutral-100 px-2 py-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Μετακίνηση άρθρου ${index + 1}`}
          className="cursor-grab text-neutral-300 hover:text-neutral-600 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="font-mono text-[10px] text-neutral-400">ΑΡΘΡΟ {index + 1}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Αφαίρεση άρθρου ${index + 1}`}
          className="text-neutral-300 transition-colors hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-2.5 p-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Τίτλος</span>
          <input
            value={article.title}
            onChange={(e) => onChange({ ...article, title: e.target.value })}
            className={INPUT}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">
            Κείμενο <span className="font-normal">— επιτρέπονται &lt;strong&gt;, &lt;em&gt; και σύνδεσμοι</span>
          </span>
          <textarea
            rows={3}
            value={article.excerpt}
            onChange={(e) => onChange({ ...article, excerpt: e.target.value })}
            className={AREA}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Ετικέτα</span>
          <input
            value={article.tag}
            onChange={(e) => onChange({ ...article, tag: e.target.value })}
            placeholder="π.χ. ΝΕΑ ΜΑΡΚΑ"
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Κουμπί</span>
          <input
            value={article.cta}
            onChange={(e) => onChange({ ...article, cta: e.target.value })}
            placeholder="Διαβαστε περισσοτερα"
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Σύνδεσμος</span>
          <input
            value={article.url}
            onChange={(e) => onChange({ ...article, url: e.target.value })}
            placeholder="https://web.kolleris.com/…"
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Εικόνα (URL)</span>
          <input
            value={article.image}
            onChange={(e) => onChange({ ...article, image: e.target.value })}
            placeholder="https://kolleris.b-cdn.net/…"
            className={INPUT}
          />
        </label>
      </div>
    </li>
  );
}

export function NewsEditor({
  value,
  onChange,
}: {
  value: NewsContent;
  onChange: (next: NewsContent) => void;
}) {
  const [picking, setPicking] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setIssue = (patch: Partial<NewsContent["issue"]>) =>
    onChange({ ...value, issue: { ...value.issue, ...patch } });
  const setHero = (patch: Partial<NewsContent["hero"]>) =>
    onChange({ ...value, hero: { ...value.hero, ...patch } });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = value.articles.findIndex((a) => a.id === active.id);
    const to = value.articles.findIndex((a) => a.id === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...value, articles: arrayMove(value.articles, from, to) });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 border border-neutral-200 bg-white p-4 sm:grid-cols-3">
        <p className="text-[13px] font-semibold sm:col-span-3">Το τεύχος</p>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Ετικέτα</span>
          <input value={value.issue.label} onChange={(e) => setIssue({ label: e.target.value })} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Αριθμός / μήνας</span>
          <input
            value={value.issue.number}
            onChange={(e) => setIssue({ number: e.target.value })}
            placeholder="Σεπτέμβριος 2026"
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Τίτλος</span>
          <input value={value.issue.title} onChange={(e) => setIssue({ title: e.target.value })} className={INPUT} />
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">
            Εισαγωγή <span className="font-normal">— η παράγραφος που διαβάζεται πρώτη</span>
          </span>
          <textarea
            rows={3}
            value={value.issue.intro}
            onChange={(e) => setIssue({ intro: e.target.value })}
            className={AREA}
          />
        </label>
      </div>

      <div className="grid gap-3 border border-neutral-200 bg-white p-4 sm:grid-cols-3">
        <p className="text-[13px] font-semibold sm:col-span-3">Κύριο θέμα</p>
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Επικεφαλίδα</span>
          <input value={value.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} className={INPUT} />
        </label>
        {/*
          Ο τίτλος σπάει σε τρία επίτηδες: το πρότυπο βάφει ΜΟΝΟ το μεσαίο
          κομμάτι κόκκινο. Ένα ενιαίο πεδίο θα σήμαινε ή όλα κόκκινα ή τίποτα.
        */}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Τίτλος — αρχή</span>
          <input
            value={value.hero.title_before}
            onChange={(e) => setHero({ title_before: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">
            Τίτλος — <span className="text-red-600">έμφαση</span>
          </span>
          <input
            value={value.hero.title_accent}
            onChange={(e) => setHero({ title_accent: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Τίτλος — τέλος</span>
          <input
            value={value.hero.title_after}
            onChange={(e) => setHero({ title_after: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Κείμενο</span>
          <textarea rows={3} value={value.hero.text} onChange={(e) => setHero({ text: e.target.value })} className={AREA} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Εικόνα (URL)</span>
          <input value={value.hero.image} onChange={(e) => setHero({ image: e.target.value })} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-neutral-500">Σύνδεσμος</span>
          <input value={value.hero.url} onChange={(e) => setHero({ url: e.target.value })} className={INPUT} />
        </label>
      </div>

      <div className="border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-semibold">
            Άρθρα{" "}
            <span className="font-normal text-neutral-500">
              {value.articles.length ? `· ${value.articles.length}` : "· κανένα ακόμη"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 border border-neutral-300 px-3 text-[12px] font-medium hover:border-neutral-900"
          >
            <Plus className="h-3.5 w-3.5" /> Προσθήκη από περιεχόμενο
          </button>
        </div>

        {picking && (
          <SourcePicker
            onPick={(src) => {
              onChange({
                ...value,
                articles: [
                  ...value.articles,
                  {
                    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    title: src.title,
                    excerpt: src.excerpt,
                    tag: src.tag,
                    image: src.image,
                    url: src.url,
                    cta: src.kind === "offer" ? "Δειτε την προσφορα" : "Διαβαστε περισσοτερα",
                  },
                ],
              });
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}

        {value.articles.length === 0 ? (
          <p className="border border-dashed border-neutral-200 p-6 text-center text-[12px] text-neutral-500">
            Διαλέξτε από άρθρα του blog και ενεργές προσφορές — τίτλος, κείμενο, εικόνα και
            σύνδεσμος έρχονται μαζί και μετά αλλάζουν ελεύθερα. Σύρετέ τα για σειρά: η πρώτη θέση
            είναι ό,τι διαβάζεται χωρίς scroll.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={value.articles.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2.5">
                {value.articles.map((a, i) => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    index={i}
                    onChange={(next) =>
                      onChange({
                        ...value,
                        articles: value.articles.map((x) => (x.id === a.id ? next : x)),
                      })
                    }
                    onRemove={() =>
                      onChange({ ...value, articles: value.articles.filter((x) => x.id !== a.id) })
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

/**
 * Ο επιλογέας πηγών.
 *
 * Δείχνει ό,τι υπάρχει ήδη — άρθρα και προσφορές — με την εικόνα του, ώστε ο
 * συντάκτης να αναγνωρίζει το αντικείμενο πριν το προσθέσει. Λίστα με σκέτους
 * τίτλους θα τον ανάγκαζε να ανοίξει το site για να θυμηθεί ποιο είναι ποιο.
 */
function SourcePicker({
  onPick,
  onClose,
}: {
  onPick: (src: NewsSource) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<NewsSource[]>([]);
  const [pending, start] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      start(async () => setRows(await searchNewsSourcesAction(query)));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return (
    <div className="mb-3 border border-neutral-300 bg-neutral-50 p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση σε άρθρα και προσφορές…"
            className="h-9 w-full border border-neutral-300 pr-3 pl-9 text-[13px] outline-none focus:border-neutral-900"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Κλείσιμο"
          className="h-9 px-2 text-neutral-400 hover:text-neutral-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-neutral-500">
        {pending ? "Αναζήτηση…" : `${rows.length} διαθέσιμα`}
      </p>

      <ul className="mt-2 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
        {rows.map((src, i) => (
          <li key={`${src.kind}-${src.url}-${i}`}>
            <button
              type="button"
              onClick={() => onPick(src)}
              className="flex w-full items-center gap-3 border border-neutral-200 bg-white p-2 text-left transition-colors hover:border-neutral-900"
            >
              {src.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src.image} alt="" className="h-12 w-16 shrink-0 border border-neutral-100 object-cover" />
              ) : (
                <span className="flex h-12 w-16 shrink-0 items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                  χωρίς εικόνα
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] tracking-wide text-neutral-500 uppercase">
                  {src.kindLabel}
                </span>
                <span className="line-clamp-1 text-[12.5px] font-medium">{src.title}</span>
                <span className="line-clamp-1 text-[11px] text-neutral-500">{src.excerpt}</span>
              </span>
              <Plus className="h-4 w-4 shrink-0 text-neutral-400" />
            </button>
          </li>
        ))}
        {!pending && rows.length === 0 && (
          <li className="border border-dashed border-neutral-200 bg-white p-5 text-center text-[12px] text-neutral-500">
            Κανένα άρθρο ή προσφορά. Δημιουργήστε πρώτα περιεχόμενο, ή αλλάξτε τον όρο αναζήτησης.
          </li>
        )}
      </ul>
    </div>
  );
}
