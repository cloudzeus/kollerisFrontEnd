"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useActionState, useState } from "react";
import { inviteMember, removeMember, updateMember, type AuthState } from "@/lib/account/actions";
import {
  COMPANY_ROLE_HELP,
  COMPANY_ROLE_LABELS,
  type CompanyMember,
  type CompanyRole,
} from "@/lib/account/contract";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

const ROLES: CompanyRole[] = ["owner", "buyer", "viewer"];

/**
 * Company users — the screen that makes a B2B account a COMPANY rather than a
 * person with a discount.
 *
 * Read-only for everyone but owners. `canManage` is computed on the server from
 * the session; every mutation re-checks it there too, because a hidden button
 * is a hint and not a permission.
 */
export function MemberTable({
  members,
  canManage,
  currentUserId,
}: {
  members: CompanyMember[];
  canManage: boolean;
  currentUserId: string;
}) {
  const t = useTranslations("account.MemberAdmin");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-y border-k-line bg-k-surface-2">
            {[t("col_user"), t("col_role"), t("col_limit"), t("col_year"), t("col_status"), ""].map((h, i) => (
              <th
                key={h || i}
                scope="col"
                className="t-account-label px-3 py-3 text-k-text-4 lg:px-4"
              >
                {h && upGreek(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              canManage={canManage}
              isSelf={member.id === currentUserId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({
  member,
  canManage,
  isSelf,
}: {
  member: CompanyMember;
  canManage: boolean;
  isSelf: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("account.MemberAdmin");
  const [updateState, update, updating] = useActionState<AuthState, FormData>(updateMember, {});
  const [removeState, remove, removing] = useActionState<AuthState, FormData>(removeMember, {});
  const [editing, setEditing] = useState(false);

  const error = updateState.error || removeState.error;

  return (
    <>
      <tr className="border-b border-k-line align-top">
        <td className="px-3 py-3.5 lg:px-4">
          <span className="block text-[13px] font-medium text-k-ink">
            {member.firstName} {member.lastName}
            {isSelf && <span className="t-brand-count ml-2 text-k-text-4">{upGreek(t("eseis"))}</span>}
          </span>
          <span className="mt-0.5 block font-mono text-[11.5px] text-k-text-4">{member.email}</span>
        </td>

        <td className="px-3 py-3.5 lg:px-4">
          <span className="text-[12.5px] text-k-ink">{COMPANY_ROLE_LABELS[member.role]}</span>
          <span className="mt-0.5 block text-[11px] leading-[1.45] text-k-text-4">
            {COMPANY_ROLE_HELP[member.role]}
          </span>
        </td>

        <td className="px-3 py-3.5 font-mono text-[12.5px] text-k-ink lg:px-4">
          {member.spendLimit == null ? (
            <span className="text-k-text-4">{upGreek(t("choris_orio"))}</span>
          ) : (
            formatMoney(member.spendLimit, locale)
          )}
        </td>

        <td className="px-3 py-3.5 lg:px-4">
          <span className="block font-mono text-[12.5px] text-k-ink">
            {formatMoney(member.spentThisYear, locale)}
          </span>
          <span className="t-brand-count mt-0.5 block text-k-text-4">
            {member.ordersThisYear} {upGreek(t("paraggelies"))}
          </span>
        </td>

        <td className="px-3 py-3.5 lg:px-4">
          <Status status={member.status} />
        </td>

        <td className="px-3 py-3.5 text-right lg:px-4">
          {canManage && !isSelf && (
            <span className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="t-brand-count text-k-ink underline underline-offset-4 hover:text-k-red"
              >
                {upGreek(editing ? t("akyro") : t("allagi"))}
              </button>
              <form action={remove}>
                <input type="hidden" name="memberId" value={member.id} />
                <button
                  type="submit"
                  disabled={removing}
                  className="t-brand-count text-k-text-4 underline underline-offset-4 hover:text-k-red disabled:opacity-50"
                >
                  {upGreek(removing ? "…" : t("afairesi"))}
                </button>
              </form>
            </span>
          )}
        </td>
      </tr>

      {editing && canManage && (
        <tr className="border-b border-k-line bg-k-surface-2">
          <td colSpan={6} className="px-3 py-4 lg:px-4">
            <form action={update} className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="memberId" value={member.id} />

              <label className="block">
                <span className="t-account-label mb-1.5 block text-k-text-4">{upGreek(t("rolos"))}</span>
                <select
                  name="role"
                  defaultValue={member.role}
                  className="t-input h-11 border border-k-line-2 bg-white px-3 text-k-ink outline-none focus:border-k-ink"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {COMPANY_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="t-account-label mb-1.5 block text-k-text-4">
                  {upGreek(t("orio_ana_paraggelia"))}
                </span>
                <input
                  name="spendLimit"
                  type="number"
                  min={0}
                  step={10}
                  defaultValue={member.spendLimit ?? ""}
                  placeholder={t("choris_orio")}
                  className="t-input h-11 w-44 border border-k-line-2 bg-white px-3 text-k-ink outline-none focus:border-k-ink"
                />
              </label>

              <label className="block">
                <span className="t-account-label mb-1.5 block text-k-text-4">{upGreek(t("katastasi"))}</span>
                <select
                  name="status"
                  defaultValue={member.status === "suspended" ? "suspended" : "active"}
                  className="t-input h-11 border border-k-line-2 bg-white px-3 text-k-ink outline-none focus:border-k-ink"
                >
                  <option value="active">{t("energos")}</option>
                  <option value="suspended">{t("se_anastoli")}</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={updating}
                className="t-btn-sm h-11 bg-k-ink px-6 text-white transition-colors hover:bg-k-red disabled:opacity-60"
              >
                {updating ? "…" : upGreek(t("apothikeysi"))}
              </button>
            </form>
            {error && <p className="mt-2.5 text-[12px] text-k-red">{error}</p>}
          </td>
        </tr>
      )}

      {error && !editing && (
        <tr className="border-b border-k-line">
          <td colSpan={6} className="px-3 py-2 text-[12px] text-k-red lg:px-4">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

function Status({ status }: { status: CompanyMember["status"] }) {
  const t = useTranslations("account.MemberAdmin");
  const map = {
    active: { label: t("status_active"), className: "text-k-green" },
    invited: { label: t("status_invited"), className: "text-k-amber" },
    pending: { label: t("status_pending"), className: "text-k-amber" },
    suspended: { label: t("status_suspended"), className: "text-k-red" },
    rejected: { label: t("status_rejected"), className: "text-k-text-4" },
  } as const;
  const item = map[status];

  return (
    <span className={`t-card-stock flex items-center gap-1.5 ${item.className}`}>
      <span aria-hidden className="rounded-pill block h-1.5 w-1.5 bg-current" />
      {upGreek(item.label)}
    </span>
  );
}

export function InviteMemberForm() {
  const t = useTranslations("account.MemberAdmin");
  const [state, action, pending] = useActionState<AuthState, FormData>(inviteMember, {});
  const [role, setRole] = useState<CompanyRole>("buyer");

  return (
    <form action={action} className="border border-k-line bg-k-surface-2 p-4 lg:p-5">
      <p className="t-eyebrow text-k-red">{upGreek(t("prosklisi_christi"))}</p>
      <p className="mt-2 max-w-xl text-[12.5px] leading-[1.55] text-k-text-3">
        {t("o_christis_lamvanei_email_me")}
      </p>

      {state.error && (
        <p role="alert" className="mt-3 border-l-[3px] border-k-red bg-white px-3 py-2 text-[12.5px] text-k-ink">
          {state.error}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Small label={t("onoma")} name="firstName" required />
        <Small label={t("eponymo")} name="lastName" required />
        <Small label="Email" name="email" type="email" required className="sm:col-span-2 lg:col-span-1" />

        <label className="block">
          <span className="t-account-label mb-1.5 block text-k-text-4">{upGreek(t("rolos"))}</span>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as CompanyRole)}
            className="t-input h-12 w-full border border-k-line-2 bg-white px-3 text-k-ink outline-none focus:border-k-ink"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {COMPANY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-[11.5px] leading-[1.5] text-k-text-4">{COMPANY_ROLE_HELP[role]}</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        {/* An owner has no ceiling by definition, so offering one would be a
            control that does nothing. */}
        {role !== "owner" && (
          <Small
            label={t("orio_ana_paraggelia")}
            name="spendLimit"
            type="number"
            placeholder={t("choris_orio")}
          />
        )}
        <button
          type="submit"
          disabled={pending}
          className="t-btn-sm h-12 bg-k-ink px-7 text-white transition-colors hover:bg-k-red disabled:opacity-60"
        >
          {pending ? "…" : upGreek(t("apostoli_prosklisis"))}
        </button>
      </div>
    </form>
  );
}

function Small({
  label,
  name,
  type = "text",
  required,
  placeholder,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="t-account-label mb-1.5 block text-k-text-4">
        {upGreek(label)}
        {required && <span className="ml-1 text-k-red">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        min={type === "number" ? 0 : undefined}
        className="t-input h-12 w-full border border-k-line-2 bg-white px-3.5 text-k-ink outline-none focus:border-k-ink"
      />
    </label>
  );
}
