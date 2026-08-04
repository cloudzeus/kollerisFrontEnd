/**
 * What the mini admin is allowed to configure.
 *
 * A closed registry rather than free-form key/value, for two reasons: an
 * arbitrary key is a typo that silently does nothing, and `isSecret` has to be a
 * property of the KEY, not of whoever happens to be writing it — otherwise one
 * careless write stores a payment secret in plaintext.
 *
 * `envVar` is the seed, not the override. When a row exists it wins; `.env` only
 * answers before anything has been saved. The opposite would mean an operator
 * changes a value, sees nothing happen, and has no way to discover why.
 *
 * Client-safe: definitions only, no values, no I/O.
 */

export type SettingGroup = "erp" | "payment" | "courier" | "shop";

export type SettingDef = {
  key: string;
  group: SettingGroup;
  label: string;
  /** Shown under the field. Say what it affects, not what it is. */
  help?: string;
  /** Secrets are encrypted, never sent to the browser, and shown as ••••1234. */
  secret?: boolean;
  kind: "text" | "number" | "select";
  options?: ReadonlyArray<{ value: string; label: string }>;
  envVar: string;
  placeholder?: string;
};

export const SETTING_GROUPS: ReadonlyArray<{ id: SettingGroup; title: string; blurb: string }> = [
  {
    id: "payment",
    title: "Πληρωμές",
    blurb: "Viva Wallet. Τα μυστικά αποθηκεύονται κρυπτογραφημένα και δεν εμφανίζονται ποτέ ξανά.",
  },
  {
    id: "erp",
    title: "ERP — παραστατικά",
    blurb:
      "Σε ποια σειρά SoftOne γράφονται οι παραγγελίες. Στέλνονται με κάθε παραγγελία και αποθηκεύονται πάνω της, ώστε κάθε παραστατικό να ανάγεται στη ρύθμιση που το παρήγαγε.",
  },
  {
    id: "courier",
    title: "Μεταφορική",
    blurb: "ACS. Οι τιμές έρχονται ζωντανά από τον τιμοκατάλογό σας μέσω του HDCtool.",
  },
  { id: "shop", title: "Κατάστημα", blurb: "Όρια και κατώφλια του ταμείου." },
] as const;

export const SETTINGS: ReadonlyArray<SettingDef> = [
  // ── Πληρωμές ──
  {
    key: "viva.environment",
    group: "payment",
    label: "Περιβάλλον Viva",
    help: "Σε «Παραγωγή» χρεώνονται πραγματικές κάρτες.",
    kind: "select",
    options: [
      { value: "demo", label: "Demo — δοκιμαστικές χρεώσεις" },
      { value: "production", label: "Παραγωγή — πραγματικές χρεώσεις" },
    ],
    envVar: "VIVA_ENVIRONMENT",
  },
  {
    key: "viva.sourceCode",
    group: "payment",
    label: "Source code",
    help: "Ο κωδικός του καταστήματος πληρωμών στο Viva.",
    kind: "text",
    envVar: "VIVA_SOURCE_CODE",
    placeholder: "3255",
  },
  {
    key: "viva.merchantId",
    group: "payment",
    label: "Merchant ID",
    kind: "text",
    envVar: "VIVA_MERCHANT_ID",
  },
  {
    key: "viva.clientId",
    group: "payment",
    label: "Client ID",
    kind: "text",
    envVar: "VIVA_CLIENT_ID",
  },
  {
    key: "viva.clientSecret",
    group: "payment",
    label: "Client secret",
    help: "Γράψτε νέα τιμή για αντικατάσταση. Η υπάρχουσα δεν εμφανίζεται ποτέ.",
    secret: true,
    kind: "text",
    envVar: "VIVA_CLIENT_SECRET",
  },
  {
    key: "viva.apiKey",
    group: "payment",
    label: "API key",
    secret: true,
    kind: "text",
    envVar: "VIVA_API_KEY",
  },
  {
    key: "viva.webhookKey",
    group: "payment",
    label: "Κλειδί επαλήθευσης webhook",
    secret: true,
    kind: "text",
    envVar: "VIVA_WEBHOOK_VERIFICATION_KEY",
  },

  // ── ERP ──
  {
    key: "erp.series",
    group: "erp",
    label: "Σειρά παραστατικού (SERIES)",
    help: "Το Magento χρησιμοποιεί 5021, το Skroutz 7021. Όσο μοιράζεστε σειρά με το Magento, οι παραγγελίες ξεχωρίζουν μόνο από τον δείκτη καναλιού.",
    kind: "number",
    envVar: "ERP_SERIES",
    placeholder: "5021",
  },
  {
    key: "erp.uftb01",
    group: "erp",
    label: "Δείκτης καναλιού (UFTB01)",
    help: "Magento 102, Skroutz 101.",
    kind: "number",
    envVar: "ERP_UFTB01",
    placeholder: "102",
  },
  {
    key: "erp.payment",
    group: "erp",
    label: "Κωδικός τρόπου πληρωμής",
    kind: "number",
    envVar: "ERP_PAYMENT",
    placeholder: "1025",
  },
  {
    key: "erp.shipment",
    group: "erp",
    label: "Κωδικός τρόπου αποστολής",
    kind: "number",
    envVar: "ERP_SHIPMENT",
    placeholder: "111",
  },

  // ── Μεταφορική ──
  {
    key: "acs.originStation",
    group: "courier",
    label: "Σταθμός αφετηρίας",
    help: "Ελληνικά κεφαλαία. ΑΔ = Άγιος Διονύσιος, Πειραιάς.",
    kind: "text",
    envVar: "ACS_ORIGIN_STATION",
    placeholder: "ΑΔ",
  },

  // ── Κατάστημα ──
  {
    key: "shop.maxWidth",
    group: "shop",
    label: "Μέγιστο πλάτος ιστοσελίδας (px)",
    help:
      "Πάνω από αυτό το πλάτος η σελίδα σταματά να απλώνεται και κεντράρεται. " +
      "Ορίζει και τι θεωρείται «πλατιά οθόνη» για τη διάταξη των banner.",
    kind: "number",
    envVar: "SITE_MAX_WIDTH",
    placeholder: "2500",
  },
  {
    key: "shop.freeShippingNet",
    group: "shop",
    label: "Δωρεάν μεταφορικά από (καθαρή αξία)",
    help: "Σε ευρώ, χωρίς ΦΠΑ.",
    kind: "number",
    envVar: "FREE_SHIPPING_THRESHOLD_NET",
  },
] as const;

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

/** What the browser is allowed to see: never a secret's value, only a hint. */
export type SettingView = {
  key: string;
  /** The value for ordinary settings; null for secrets. */
  value: string | null;
  /** "••••3H8H" when a secret is set, null when it has never been set. */
  hint: string | null;
  /** True when the value comes from `.env` because nothing has been saved yet. */
  fromEnv: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};
