/**
 * Customer-screen shapes and labels.
 *
 * Split from the query module so the client component can import them without
 * pulling in `server-only` and Prisma — same split as the inbox and the zone
 * registry.
 *
 * Client-safe: no Prisma, no network.
 */

export type CustomerFilter = "pending" | "active" | "individuals" | "all";

export const CUSTOMER_FILTERS: ReadonlyArray<{ id: CustomerFilter; label: string }> = [
  { id: "pending", label: "Προς έγκριση" },
  { id: "active", label: "Ενεργές εταιρείες" },
  { id: "individuals", label: "Ιδιώτες" },
  { id: "all", label: "Όλοι" },
] as const;

export const ROLE_LABEL: Record<string, string> = {
  owner: "Υπεύθυνος",
  buyer: "Αγοραστής",
  viewer: "Προβολή",
};

export type CompanyMember = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  status: string;
  spendLimit: number | null;
};

export type CompanyRow = {
  id: string;
  name: string;
  afm: string;
  doy: string | null;
  profession: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  /** The join to SoftOne. Null until the company is approved. */
  erpTrdr: number | null;
  /** Written from what the ERP returned; null means no partner discount. */
  partnerFactor: number | null;
  creditLimit: number | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  members: CompanyMember[];
  /** Hours since registration, for the waiting marker on the pending queue. */
  waitingHours: number;
};

export type IndividualRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: Date;
  orders: number;
};

export type CustomersPage = {
  companies: CompanyRow[];
  individuals: IndividualRow[];
  counts: Record<CustomerFilter, number>;
};
