"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN } from "@/lib/admin/users-types";

// No 0/O, 1/l/I: the password is usually read out or retyped once.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_!@#%";

export function generatePassword(length = 18): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * A password input that can generate, reveal and copy.
 *
 * Nobody sends the new user an email from here, so whoever creates the account
 * has to hand the password over — which is why a generated one is shown in
 * clear and can be copied in one click.
 */
export function PasswordField({
  id,
  value,
  onChange,
  label = "Κωδικός",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const short = value.length > 0 && value.length < PASSWORD_MIN;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setVisible(true);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Input
            id={id}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={short || undefined}
            aria-describedby={`${id}-hint`}
            className="pr-9 font-mono"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-k-text-4 hover:text-k-ink"
            aria-label={visible ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            onChange(generatePassword());
            setVisible(true);
          }}
          aria-label="Δημιουργία κωδικού"
          title="Δημιουργία κωδικού"
        >
          <Wand2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          disabled={!value}
          aria-label="Αντιγραφή κωδικού"
          title="Αντιγραφή"
        >
          {copied ? <Check className="size-4 text-k-green" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p id={`${id}-hint`} className={short ? "text-[11.5px] text-k-red" : "text-[11.5px] text-k-text-4"}>
        Τουλάχιστον {PASSWORD_MIN} χαρακτήρες{short ? ` — λείπουν ${PASSWORD_MIN - value.length}` : ""}.
      </p>
    </div>
  );
}
