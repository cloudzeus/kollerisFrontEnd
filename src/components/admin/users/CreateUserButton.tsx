"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { AdminRole } from "@/generated/prisma/enums";
import { actionCreateUser } from "@/app/admin/(protected)/users/actions";
import { PASSWORD_MIN } from "@/lib/admin/users-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasswordField, generatePassword } from "./PasswordField";
import { RoleSelect } from "./RoleSelect";

const EMPTY = { email: "", name: "", role: "EDITOR" as AdminRole, password: "" };

export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openDialog() {
    setForm({ ...EMPTY, password: generatePassword() });
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await actionCreateUser(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Ο χρήστης δημιουργήθηκε.", {
        description: "Δώστε του τον κωδικό — δεν στέλνεται email.",
      });
      setOpen(false);
    });
  }

  const valid = form.email.includes("@") && form.password.length >= PASSWORD_MIN;

  return (
    <>
      <Button onClick={openDialog} className="h-9 gap-1.5">
        <UserPlus className="size-4" aria-hidden />
        Νέος χρήστης
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Νέος χρήστης</DialogTitle>
              <DialogDescription>
                Θα μπορεί να συνδεθεί στο /admin αμέσως, με τον κωδικό που θα του δώσετε.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="off"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Όνομα</Label>
              <Input
                id="new-name"
                autoComplete="off"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <RoleSelect id="new-role" value={form.role} onChange={(role) => setForm({ ...form, role })} />
            <PasswordField id="new-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />

            {error && (
              <p role="alert" className="border-l-[3px] border-k-red bg-k-surface-2 px-3 py-2 text-[12.5px] text-k-red">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Άκυρο
              </Button>
              <Button type="submit" disabled={pending || !valid}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Δημιουργία
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
