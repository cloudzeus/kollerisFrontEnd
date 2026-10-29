"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Strikethrough,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Rich-text editor for the content admin.
 *
 * Headless TipTap with a compact toolbar. The value is HTML; `onChange` fires
 * the current HTML on every edit, so it plugs into the same draft map the plain
 * fields use. Programmatic content changes (translation fill, reset to original)
 * do not emit an update, so they never mark the field dirty on their own.
 *
 * The editing surface wears `.prose-kolleris`, the same class the storefront
 * uses, so what you type looks like what ships.
 */
export function RichTextEditor({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (html: string) => void;
  id?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "prose-kolleris min-h-[8rem] px-3 py-2 text-[length:var(--fs-14)] leading-[1.6] outline-none",
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Reflect an externally replaced value (translation fill, "restore original")
  // without emitting an update, so it does not count as an edit.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && !(value === "" && current === "<p></p>")) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="max-w-[40rem] rounded-md border border-k-line-2 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-k-line p-1">
        <ToolbarButton label="Έντονα" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Πλάγια" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Υπογράμμιση" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Διαγραφή" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-4" aria-hidden />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Επικεφαλίδα 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Επικεφαλίδα 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="size-4" aria-hidden />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Λίστα" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Αριθμημένη λίστα" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" aria-hidden />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Σύνδεσμος" active={editor.isActive("link")} onClick={() => setLink(editor)}>
          <LinkIcon className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Αφαίρεση συνδέσμου" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink className="size-4" aria-hidden />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-transparent text-k-text-2 transition-colors hover:bg-k-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-k-ink/40",
        active && "bg-k-surface-3 text-k-ink",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-k-line" aria-hidden />;
}

/** Prompt for a URL and set (or clear) the link on the selection. */
function setLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Διεύθυνση συνδέσμου:", previous ?? "https://");
  if (url === null) return; // cancelled
  if (url.trim() === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
}
