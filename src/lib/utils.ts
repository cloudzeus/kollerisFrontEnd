import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * `clsx` handles conditionals and arrays; `twMerge` resolves conflicts, so a
 * component's default `px-4` is actually replaced by a caller's `px-6` instead
 * of both landing in the class list and the outcome depending on stylesheet
 * order. Every ui/ primitive takes `className` on that assumption.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
