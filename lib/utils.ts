import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — merge conditional class names, resolving Tailwind conflicts.
 *
 * This is the single design-system glue in `lib/` (design.md D5). It stays
 * framework-free (no `react`, no `next/*`) so it is trivially unit-testable.
 * `clsx` flattens/condition-resolves inputs; `twMerge` then dedupes conflicting
 * Tailwind utilities (e.g. a later `px-4` wins over an earlier `px-2`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
