/**
 * The /admin gate as a pure decision, so the proxy stays thin and the rules
 * can be tested without a next-auth session.
 */

/** The sign-in page and the hidden emergency (password) page. */
export function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/admin/login/emergency";
}

export type AdminGateDecision =
  | { action: "next" }
  | { action: "redirect"; to: string; redirect?: string };

export function adminGate(pathname: string, isAuthed: boolean): AdminGateDecision {
  const isLoginPage = isAdminLoginPath(pathname);
  if (!isAuthed && !isLoginPage) return { action: "redirect", to: "/admin/login", redirect: pathname };
  if (isAuthed && isLoginPage) return { action: "redirect", to: "/admin" };
  return { action: "next" };
}
