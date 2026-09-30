import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { register } from "@/lib/account/actions";
import { B2B_CLOSED_MESSAGE, B2B_REGISTRATION_OPEN } from "@/lib/account/b2b-registration";

describe("B2B registration while closed", () => {
  it("is closed", () => {
    expect(B2B_REGISTRATION_OPEN).toBe(false);
  });

  it("refuses a company registration on the server, whatever the form sends", async () => {
    const form = new FormData();
    form.set("accountType", "company");
    form.set("email", "someone@example.com");
    form.set("password", "Str0ngPassword!");
    form.set("terms", "on");
    await expect(register({}, form)).resolves.toEqual({ error: B2B_CLOSED_MESSAGE });
  });
});
