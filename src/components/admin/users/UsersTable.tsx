"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Lock, MoreHorizontal, Pencil, Power, Unlock } from "lucide-react";
import { toast } from "sonner";
import type { AdminRole } from "@/generated/prisma/enums";
import {
  actionResetPassword,
  actionSetActive,
  actionUnlock,
  actionUpdateUser,
} from "@/app/admin/(protected)/users/actions";
import { PASSWORD_MIN, type ActionResult, type AdminUserRow } from "@/lib/admin/users-types";
import { ROLE_META } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PasswordField, generatePassword } from "./PasswordField";
import { RoleSelect } from "./RoleSelect";

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

const ROLE_TONE: Record<AdminRole, string> = {
  ADMIN: "border-k-ink bg-k-ink text-white",
  EDITOR: "border-k-line-2 bg-white text-k-ink",
  OPS: "border-k-line-2 bg-k-surface-2 text-k-ink",
};

type Dialogs =
  | { kind: "edit"; user: AdminUserRow }
  | { kind: "password"; user: AdminUserRow }
  | { kind: "active"; user: AdminUserRow }
  | null;

/**
 * The operators.
 *
 * Actions sit in a per-row menu rather than as buttons: four buttons on every
 * row make "Απενεργοποίηση" as easy to hit as "Επεξεργασία". Anything that
 * locks somebody out asks first.
 */
export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    start(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        setDialog(null);
        after?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (users.length === 0) {
    return (
      <p className="border border-k-line bg-white px-4 py-14 text-center text-[13px] text-k-text-3">
        Κανένας χρήστης.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto border border-k-line bg-white">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr className="border-b border-k-line text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
              <th className="px-3 py-2 font-medium">Χρήστης</th>
              <th className="px-3 py-2 font-medium">Ρόλος</th>
              <th className="px-3 py-2 font-medium">Κατάσταση</th>
              <th className="px-3 py-2 font-medium">Τελευταία είσοδος</th>
              <th className="px-3 py-2 font-medium">Δημιουργία</th>
              <th className="w-12 px-3 py-2">
                <span className="sr-only">Ενέργειες</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className={cn("border-b border-k-line last:border-0", !u.isActive && "bg-k-surface-2/60")}
              >
                <td className="px-3 py-2.5">
                  <p className={cn("text-[12.5px]", u.isActive ? "text-k-ink" : "text-k-text-3")}>
                    {u.name || "—"}
                    {u.isSelf && (
                      <span className="ml-1.5 text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">εσείς</span>
                    )}
                  </p>
                  <p className="text-[11.5px] text-k-text-3">{u.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex border px-1.5 py-0.5 text-[11px] font-medium",
                      u.isActive ? ROLE_TONE[u.role] : "border-k-line bg-white text-k-text-3",
                    )}
                  >
                    {ROLE_META[u.role].label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[12px]">
                  {!u.isActive ? (
                    <span className="text-k-text-3">Ανενεργός</span>
                  ) : u.locked ? (
                    <span className="inline-flex items-center gap-1 text-k-red">
                      <Lock className="size-3.5" aria-hidden />
                      Κλειδωμένος
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-k-green">
                      <span className="size-1.5 bg-k-green" aria-hidden />
                      Ενεργός
                    </span>
                  )}
                  {u.recentFailures > 0 && !u.locked && (
                    <span className="numeral block text-[11px] text-k-amber">
                      {u.recentFailures} αποτυχημένες προσπάθειες
                    </span>
                  )}
                </td>
                <td className="numeral px-3 py-2.5 text-[11.5px] text-k-text-3">
                  {u.lastLoginAt ? dt.format(u.lastLoginAt) : "Ποτέ"}
                </td>
                <td className="numeral px-3 py-2.5 text-[11.5px] text-k-text-4">{dt.format(u.createdAt)}</td>
                <td className="px-3 py-2.5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Ενέργειες για ${u.email}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", user: u })}>
                        <Pencil className="size-4" />
                        Επεξεργασία
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "password", user: u })}>
                        <KeyRound className="size-4" />
                        Νέος κωδικός
                      </DropdownMenuItem>
                      {u.recentFailures > 0 && (
                        <DropdownMenuItem disabled={pending} onSelect={() => run(() => actionUnlock(u.id))}>
                          <Unlock className="size-4" />
                          Ξεκλείδωμα
                        </DropdownMenuItem>
                      )}
                      {!u.isSelf && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant={u.isActive ? "destructive" : "default"}
                            onSelect={() =>
                              u.isActive
                                ? setDialog({ kind: "active", user: u })
                                : run(() => actionSetActive(u.id, true))
                            }
                          >
                            <Power className="size-4" />
                            {u.isActive ? "Απενεργοποίηση" : "Ενεργοποίηση"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "edit" && (
        <EditDialog
          key={dialog.user.id}
          user={dialog.user}
          pending={pending}
          onClose={() => setDialog(null)}
          onSave={(input) => run(() => actionUpdateUser(dialog.user.id, input))}
        />
      )}

      {dialog?.kind === "password" && (
        <PasswordDialog
          key={dialog.user.id}
          user={dialog.user}
          pending={pending}
          onClose={() => setDialog(null)}
          onSave={(password) =>
            run(
              () => actionResetPassword(dialog.user.id, password),
              // Your own sessions end with the reset; go and sign in again.
              dialog.user.isSelf ? () => window.location.assign("/admin") : undefined,
            )
          }
        />
      )}

      <AlertDialog open={dialog?.kind === "active"} onOpenChange={(o) => !o && !pending && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Απενεργοποίηση {dialog?.user.email}</AlertDialogTitle>
            <AlertDialogDescription>
              Αποσυνδέεται αμέσως και δεν μπορεί να ξανασυνδεθεί. Ό,τι έχει κάνει μένει στο ιστορικό με το
              όνομά του. Μπορείτε να τον ενεργοποιήσετε ξανά οποιαδήποτε στιγμή.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-k-red text-white hover:bg-k-red-hover"
              onClick={(e) => {
                e.preventDefault();
                if (dialog?.kind === "active") run(() => actionSetActive(dialog.user.id, false));
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Απενεργοποίηση
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditDialog({
  user,
  pending,
  onClose,
  onSave,
}: {
  user: AdminUserRow;
  pending: boolean;
  onClose: () => void;
  onSave: (input: { name: string; role: AdminRole }) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [role, setRole] = useState<AdminRole>(user.role);
  const dirty = name.trim() !== (user.name ?? "") || role !== user.role;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ name, role });
          }}
        >
          <DialogHeader>
            <DialogTitle>Επεξεργασία χρήστη</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Όνομα</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <RoleSelect
            id="edit-role"
            value={role}
            onChange={setRole}
            disabled={user.isSelf}
            hint={user.isSelf ? "Τον δικό σας ρόλο τον αλλάζει άλλος διαχειριστής." : undefined}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !dirty}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  user,
  pending,
  onClose,
  onSave,
}: {
  user: AdminUserRow;
  pending: boolean;
  onClose: () => void;
  onSave: (password: string) => void;
}) {
  const [password, setPassword] = useState(() => (user.isSelf ? "" : generatePassword()));

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(password);
          }}
        >
          <DialogHeader>
            <DialogTitle>Νέος κωδικός</DialogTitle>
            <DialogDescription>
              {user.isSelf
                ? "Όλες οι συνεδρίες σας κλείνουν, και αυτή. Θα συνδεθείτε ξανά με τον νέο κωδικό."
                : `Οι ανοιχτές συνεδρίες του ${user.email} κλείνουν και ο λογαριασμός ξεκλειδώνει. Αντιγράψτε τον κωδικό πριν αποθηκεύσετε.`}
            </DialogDescription>
          </DialogHeader>
          <PasswordField id="reset-password" value={password} onChange={setPassword} label="Νέος κωδικός" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || password.length < PASSWORD_MIN}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Αλλαγή κωδικού
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
