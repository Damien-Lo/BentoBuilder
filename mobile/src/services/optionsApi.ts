import { API_BASE_URL } from "@/src/config/api";
import { getPantryItems } from "@/src/services/pantryApi";

export interface SelectOption {
  _id: string;
  name: string;
  normalizedName?: string;
  icon?: string;
  isDefault?: boolean;
}

interface OptionListResponse {
  success: boolean;
  data: SelectOption[];
}

interface OptionResponse {
  success: boolean;
  data: SelectOption;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (data === null) {
    throw new Error("The server returned an empty response");
  }

  return data as T;
}

/* -------------------------------------------------------------------------- */
/*                                  Categories                                */
/* -------------------------------------------------------------------------- */

export async function getCategories(): Promise<SelectOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/categories`);

  const result = await parseResponse<OptionListResponse>(response);

  return result.data;
}

export async function createCategory(
  name: string
): Promise<SelectOption> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Category name is required");
  }

  const response = await fetch(`${API_BASE_URL}/api/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: trimmedName,
    }),
  });

  const result = await parseResponse<OptionResponse>(response);

  return result.data;
}

/* -------------------------------------------------------------------------- */
/*                              Storage Locations                             */
/* -------------------------------------------------------------------------- */

export async function getStorageLocations(): Promise<SelectOption[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/storage-locations`
  );

  const result = await parseResponse<OptionListResponse>(response);

  return result.data;
}

export async function createStorageLocation(
  name: string
): Promise<SelectOption> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Storage location name is required");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/storage-locations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: trimmedName,
      }),
    }
  );

  const result = await parseResponse<OptionResponse>(response);

  return result.data;
}

export async function deleteStorageLocation(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/storage-locations/${id}`, {
    method: "DELETE",
  });

  await parseResponse<{ success: boolean; message: string }>(response);
}

/* -------------------------------------------------------------------------- */
/*                                   Brands                                   */
/* -------------------------------------------------------------------------- */

export async function getBrands(): Promise<SelectOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/brands`);

  const result = await parseResponse<OptionListResponse>(response);

  return result.data;
}

export async function createBrand(
  name: string
): Promise<SelectOption> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Brand name is required");
  }

  const response = await fetch(`${API_BASE_URL}/api/brands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: trimmedName,
    }),
  });

  const result = await parseResponse<OptionResponse>(response);

  return result.data;
}

/* -------------------------------------------------------------------------- */
/*                                    Units                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_UNITS = [
  "item",
  "serving",
  "g",
  "kg",
  "mL",
  "L",
  "cup",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "bottle",
  "can",
  "jar",
  "packet",
  "slice",
  "fillet",
  "egg",
];

export async function getUnitSuggestions(): Promise<string[]> {
  const pantryItems = await getPantryItems();

  const previouslyUsedUnits = pantryItems
    .map((item) => item.quantityUnit?.trim())
    .filter((unit): unit is string => Boolean(unit));

  const uniqueUnits = new Map<string, string>();

  for (const unit of [...DEFAULT_UNITS, ...previouslyUsedUnits]) {
    const trimmedUnit = unit.trim();

    if (!trimmedUnit) {
      continue;
    }

    const normalizedUnit = trimmedUnit.toLowerCase();

    if (!uniqueUnits.has(normalizedUnit)) {
      uniqueUnits.set(normalizedUnit, trimmedUnit);
    }
  }

  return Array.from(uniqueUnits.values()).sort((a, b) =>
    a.localeCompare(b, undefined, {
      sensitivity: "base",
    })
  );
}