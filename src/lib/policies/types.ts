export type PolicySection = {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
};

export type PolicyContent = {
  title: string;
  updated: string;
  intro?: string;
  sections: PolicySection[];
};

export type PolicySlug =
  | "oroi-chrisis"
  | "aporrito"
  | "tropoi-pliromis"
  | "apostoli-paradosi"
  | "epistrofes"
  | "eggyiseis";
