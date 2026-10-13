import "server-only";
import { randomBytes } from "node:crypto";

/** 32 random bytes, base64url: 43 characters nobody guesses. The link's only key. */
export function newRequestToken(): string {
  return randomBytes(32).toString("base64url");
}
