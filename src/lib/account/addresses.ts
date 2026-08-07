"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/account/session";

/**
 * The address book.
 *
 * Belongs to the person, not the company: a tradesman ordering for two sites
 * wants both, and so does an employee who has things sent home.
 *
 * Every action re-reads the signed-in user and scopes its write by
 * `customerId`. An id posted from a form is a string a stranger can also post,
 * so ownership is checked on the server on every call rather than assumed from
 * the fact that the page only rendered their own.
 */

export type AddressState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

/** Greek postcodes are five digits. Anything else and ACS cannot price it. */
const schema = z.object({
  id: z.string().max(40).optional(),
  label: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(64).optional(),
  line1: z.string().trim().min(1).max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1).max(120),
  postcode: z.string().trim().regex(/^\d{5}$/),
  /** Νομός. */
  region: z.string().trim().max(120).optional(),
  /** Περιφέρεια. */
  adminRegion: z.string().trim().max(120).optional(),
  isDefault: z.union([z.literal("on"), z.literal("")]).optional(),
});

/** How many one account may keep. High enough never to be met by a real person. */
const MAX_ADDRESSES = 20;

export async function saveAddress(
  _prev: AddressState,
  formData: FormData,
): Promise<AddressState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Πρέπει να συνδεθείτε." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) {
        fieldErrors[key] =
          key === "postcode" ? "Πέντε ψηφία." : "Συμπληρώστε το πεδίο.";
      }
    }
    return { error: "Ελέγξτε τα πεδία.", fieldErrors };
  }

  const input = parsed.data;
  const isDefault = input.isDefault === "on";

  const data = {
    label: input.label,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone || null,
    line1: input.line1,
    line2: input.line2 || null,
    city: input.city,
    postcode: input.postcode,
    region: input.region || null,
    adminRegion: input.adminRegion || null,
  };

  /*
   * "Exactly one default" is kept true by clearing the others in the same
   * transaction as the write. Doing it in two steps leaves a window with two
   * defaults, and checkout would pick whichever the index returned first.
   */
  const promoteDefault = async (addressId: string) => {
    await prisma.customerAddress.updateMany({
      where: { customerId: user.id, id: { not: addressId } },
      data: { isDefault: false },
    });
  };

  if (input.id) {
    // Scoped by customerId, so an id belonging to somebody else updates nothing
    // rather than updating theirs.
    const owned = await prisma.customerAddress.findFirst({
      where: { id: input.id, customerId: user.id },
      select: { id: true },
    });
    if (!owned) return { error: "Η διεύθυνση δεν βρέθηκε." };

    await prisma.$transaction(async (tx) => {
      await tx.customerAddress.update({
        where: { id: owned.id },
        data: { ...data, isDefault },
      });
      if (isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: user.id, id: { not: owned.id } },
          data: { isDefault: false },
        });
      }
    });
  } else {
    const count = await prisma.customerAddress.count({ where: { customerId: user.id } });
    if (count >= MAX_ADDRESSES) {
      return { error: `Το πολύ ${MAX_ADDRESSES} διευθύνσεις.` };
    }

    // The first one saved is the default whatever the box says: an address book
    // with entries and no default makes checkout choose arbitrarily.
    const created = await prisma.customerAddress.create({
      data: { ...data, customerId: user.id, isDefault: isDefault || count === 0 },
      select: { id: true, isDefault: true },
    });
    if (created.isDefault) await promoteDefault(created.id);
  }

  revalidatePath("/logariasmos/dieuthynseis");
  return { ok: true };
}

export async function deleteAddress(id: string): Promise<AddressState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Πρέπει να συνδεθείτε." };

  const removed = await prisma.customerAddress.deleteMany({
    where: { id, customerId: user.id },
  });
  if (removed.count === 0) return { error: "Η διεύθυνση δεν βρέθηκε." };

  /*
   * Deleting the default leaves the book without one, so the oldest remaining
   * address takes over. Checkout should never have to guess.
   */
  const stillDefault = await prisma.customerAddress.count({
    where: { customerId: user.id, isDefault: true },
  });
  if (stillDefault === 0) {
    const next = await prisma.customerAddress.findFirst({
      where: { customerId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (next) {
      await prisma.customerAddress.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  revalidatePath("/logariasmos/dieuthynseis");
  return { ok: true };
}

export async function makeDefault(id: string): Promise<AddressState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Πρέπει να συνδεθείτε." };

  const owned = await prisma.customerAddress.findFirst({
    where: { id, customerId: user.id },
    select: { id: true },
  });
  if (!owned) return { error: "Η διεύθυνση δεν βρέθηκε." };

  await prisma.$transaction([
    prisma.customerAddress.updateMany({
      where: { customerId: user.id },
      data: { isDefault: false },
    }),
    prisma.customerAddress.update({
      where: { id: owned.id },
      data: { isDefault: true },
    }),
  ]);

  revalidatePath("/logariasmos/dieuthynseis");
  return { ok: true };
}
