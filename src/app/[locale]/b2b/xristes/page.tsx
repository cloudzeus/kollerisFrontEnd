import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import {
  InviteMemberForm,
  MemberTable,
} from "@/components/account/MemberAdmin";
import type { Locale } from "@/i18n/routing";
import { accountStore } from "@/lib/account/account-store";
import { requireCustomer } from "@/lib/account/guard";
import { getCustomerToken } from "@/lib/account/session";
import { companyCan } from "@/lib/account/contract";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "xristes.page" });
  return {
    title: t("titlos_christes_roloi"),
    robots: { index: false, follow: false },
  };
}

/**
 * Company users, roles and spend limits.
 *
 * Visible to everyone in the company — a buyer should be able to see who else
 * can order and who to ask when they hit their limit. Only an owner gets the
 * controls, and only the server actually enforces that.
 */
export default async function CompanyUsersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("xristes.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const guard = await requireCustomer(locale, "/b2b/xristes");
  const { user } = guard;
  if (user.accountType !== "company" || !user.company) redirect("/logariasmos");

  const canManage = user.role != null && companyCan(user.role, "manageUsers");

  const token = await getCustomerToken();
  const { members } = token
    ? await accountStore.members(token)
    : { members: [] };

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        user={user}
        active="/b2b/xristes"
        title={t("christes_roloi")}
        lead={t("poios_paraggelnei_gia_logariasmo_tis")}
      >
        <>
          {!canManage && (
            <p className="mb-6 flex items-start gap-2.5 border-l-[3px] border-k-line-2 bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
              <span
                aria-hidden
                className="mt-1 block h-1.5 w-1.5 shrink-0 bg-k-text-5"
              />
              {t("vlepete_toys_christes_tis_etaireias")}
            </p>
          )}

          <MemberTable
            members={members}
            canManage={canManage}
            currentUserId={user.id}
          />

          {members.length === 0 && (
            <p className="border border-k-line bg-k-surface-2 px-5 py-10 text-center text-[13px] text-k-text-3">
              {upGreek(t("den_yparchoyn_alloi_christes_akomi"))}
            </p>
          )}

          {canManage && (
            <div className="mt-8">
              <InviteMemberForm />
            </div>
          )}
        </>
      </AccountShell>
    </AccountChrome>
  );
}
