/**
 * The account contract between this storefront and HDCtool.
 *
 * HDCtool owns customer identity: it already holds the `Customer` table that
 * mirrors SoftOne TRDR, so putting credentials anywhere else would mean two
 * records per company and a reconciliation job nobody wants to own. This app is
 * the front end — it holds a session cookie and nothing else.
 *
 * Every type below is the wire shape of a method HDCtool must expose under
 * `/api/public/account/*`. They are listed as H8–H15 in BACKEND_ALIGNMENT.md §3.
 * Nothing here touches the network; `account-client.ts` does that.
 *
 * Client-safe on purpose — the forms need the enums and the field names.
 */

/**
 * What kind of account this is.
 *
 * `individual` is a private customer: orders, addresses, warranties, returns.
 * `company` is a B2B account, which is a COMPANY rather than a person — it has
 * an ΑΦΜ, it can hold several users with different roles, and it unlocks
 * partner pricing and payment on credit. A company account is created in
 * `pending` state and a human approves it.
 */
export type AccountType = "individual" | "company";

export type AccountStatus = "pending" | "active" | "suspended" | "rejected";

/**
 * Roles inside a company account.
 *
 * Deliberately three. `owner` is the person who registered the company and is
 * the only one who can invite, remove, or change what others may spend —
 * exactly the powers that need a single accountable holder. `buyer` orders
 * within a limit. `viewer` sees history and prices but cannot order, which is
 * what an accountant or a site foreman checking stock actually needs.
 */
export type CompanyRole = "owner" | "buyer" | "viewer";

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Διαχειριστής",
  buyer: "Αγοραστής",
  viewer: "Προβολή μόνο",
};

export const COMPANY_ROLE_HELP: Record<CompanyRole, string> = {
  owner: "Παραγγέλνει χωρίς όριο, διαχειρίζεται χρήστες, ρόλους και όρια.",
  buyer: "Παραγγέλνει μέχρι το όριο δαπάνης του. Δεν αλλάζει χρήστες.",
  viewer: "Βλέπει παραγγελίες και τιμές συνεργάτη. Δεν παραγγέλνει.",
};

/** What each role may do. The server enforces the same table. */
export const COMPANY_CAPABILITIES = {
  owner: ["order", "viewPartnerPrices", "viewCompanyOrders", "manageUsers", "manageCompany"],
  buyer: ["order", "viewPartnerPrices", "viewCompanyOrders"],
  viewer: ["viewPartnerPrices", "viewCompanyOrders"],
} as const;

export type CompanyCapability = (typeof COMPANY_CAPABILITIES)[CompanyRole][number];

export function companyCan(role: CompanyRole, capability: CompanyCapability): boolean {
  return (COMPANY_CAPABILITIES[role] as readonly string[]).includes(capability);
}

// ── Wire shapes ─────────────────────────────────────────────────────────────

export type AccountCompany = {
  id: string;
  name: string;
  afm: string;
  doy: string | null;
  profession: string | null;
  /** SoftOne TRDR, once the company exists in the ERP. */
  trdr: number | null;
  billAddress: string | null;
  billCity: string | null;
  billPostcode: string | null;
  phone: string | null;
  status: AccountStatus;
  /**
   * Multiplier applied to the net web price for this company. HDCtool owns it,
   * because the discount is an ERP fact. `null` means no partner pricing yet —
   * which is what a `pending` company gets.
   */
  partnerFactor: number | null;
  /** Πίστωση. Null until HDCtool exposes credit (H14). */
  creditLimit: number | null;
  creditUsed: number | null;
};

export type AccountUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  accountType: AccountType;
  status: AccountStatus;
  /** Present only for `company` accounts. */
  company: AccountCompany | null;
  /** The user's role inside `company`. Null for individuals. */
  role: CompanyRole | null;
  /** Ceiling per order, in EUR gross. Null means no ceiling. */
  spendLimit: number | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type CompanyMember = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: CompanyRole;
  status: AccountStatus | "invited";
  spendLimit: number | null;
  lastLoginAt: string | null;
  /** Orders placed by this member in the current calendar year. */
  ordersThisYear: number;
  spentThisYear: number;
};

// ── Requests ────────────────────────────────────────────────────────────────

export type LoginRequest = { email: string; password: string };

export type RegisterIndividualRequest = {
  accountType: "individual";
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type RegisterCompanyRequest = {
  accountType: "company";
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** All resolved by the ΑΦΜ lookup, then editable by the customer. */
  afm: string;
  companyName: string;
  doy: string | null;
  profession: string | null;
  billAddress: string | null;
  billCity: string | null;
  billPostcode: string | null;
  /** Present when the ΑΦΜ already exists in HDCtool / SoftOne. */
  trdr: number | null;
};

export type RegisterRequest = RegisterIndividualRequest | RegisterCompanyRequest;

export type UpdateProfileRequest = {
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export type InviteMemberRequest = {
  email: string;
  firstName: string;
  lastName: string;
  role: CompanyRole;
  spendLimit: number | null;
};

export type UpdateMemberRequest = {
  memberId: string;
  role?: CompanyRole;
  spendLimit?: number | null;
  status?: "active" | "suspended";
};

// ── Responses ───────────────────────────────────────────────────────────────

export type LoginResponse =
  | { ok: true; user: AccountUser; token: string; expiresAt: string }
  | { ok: false; error: "invalid_credentials" | "locked_out" | "pending_approval" | "suspended" };

export type RegisterResponse =
  | { ok: true; user: AccountUser; token: string; expiresAt: string }
  /** Company registrations do NOT log in — they wait for approval. */
  | { ok: true; user: AccountUser; token: null; expiresAt: null; pendingApproval: true }
  | { ok: false; error: "email_taken" | "afm_taken" | "weak_password" | "invalid_afm" };
