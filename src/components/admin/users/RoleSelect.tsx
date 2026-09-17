"use client";

import type { AdminRole } from "@/generated/prisma/enums";
import { ROLE_META, ROLES } from "@/lib/rbac";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  value: AdminRole;
  onChange: (role: AdminRole) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Ρόλος</Label>
      <Select value={value} onValueChange={(v) => onChange(v as AdminRole)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_META[role].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11.5px] leading-[1.5] text-k-text-4">{hint ?? ROLE_META[value].description}</p>
    </div>
  );
}
