export type AdminSsoMode = "off" | "both" | "only";

export interface AdminSsoConfig {
  mode: AdminSsoMode;
  clientId: string;
  issuer: string;
  hdctoolUrl: string;
  /** Lower-cased. These accounts may still sign in with a password when mode is "only". */
  emergencyEmails: string[];
}

type Env = Record<string, string | undefined>;

export function adminSsoConfig(env: Env = process.env): AdminSsoConfig {
  const raw = (env.ADMIN_SSO ?? "").trim();
  const mode: AdminSsoMode = raw === "both" || raw === "only" ? raw : "off";
  return {
    mode,
    clientId: (env.ADMIN_SSO_CLIENT_ID ?? "").trim(),
    issuer: (env.ADMIN_SSO_ISSUER ?? "").trim(),
    hdctoolUrl: (env.HDCTOOL_SSO_URL ?? "").trim().replace(/\/+$/, ""),
    emergencyEmails: (env.ADMIN_EMERGENCY_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  };
}

/** SSO is usable only when switched on and fully configured. */
export function ssoReady(cfg: AdminSsoConfig): boolean {
  return cfg.mode !== "off" && !!cfg.clientId && !!cfg.issuer && !!cfg.hdctoolUrl;
}

export function passwordLoginAllowed(email: string, cfg: AdminSsoConfig): boolean {
  if (cfg.mode !== "only") return true;
  return cfg.emergencyEmails.includes(email.trim().toLowerCase());
}
