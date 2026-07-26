import type { SelectOption } from "@/src/types/options";

/**
 * Resolves a dropdown field's value at save time: if a real option is
 * already selected, use it; otherwise treat the typed text as a name to
 * match against existing options (case-insensitive), or create a new one
 * if nothing matches. This is what lets these fields work by typing alone —
 * no separate "create" tap is needed.
 */
export async function resolveOrCreateOption<T extends SelectOption>(
  options: T[],
  selectedId: string,
  draftName: string,
  createFn: (name: string) => Promise<T>,
): Promise<T | null> {
  if (selectedId) {
    const existing = options.find((option) => option._id === selectedId);
    if (existing) {
      return existing;
    }
  }

  const trimmedName = draftName.trim();

  if (!trimmedName) {
    return null;
  }

  const existingByName = options.find(
    (option) => option.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );

  return existingByName ?? createFn(trimmedName);
}
