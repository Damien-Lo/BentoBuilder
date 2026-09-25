import type { CustomUnitConversion } from "@/src/utils/unitConversion";
import type { NullableNutrition } from "@/src/types/nutrition";

export type Nutrition = NullableNutrition;

export interface Ingredient {
  _id: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  barcode: string | null;
  isGeneric?: boolean;
  genericParent?: string | { _id: string; unitConversions?: CustomUnitConversion[] } | null;
  defaultPortionAmount: number;
  defaultPortionUnit: string;
  // Purely a display/grouping label (e.g. "steak", "fillet") - set only
  // when this ingredient is naturally bought/consumed as discrete,
  // individually-sized pieces, so the pantry list can show a piece count
  // instead of a summed weight. No weight range attached - that's a
  // per-recipe decision (Recipe.ingredientList's own wholePiece fields).
  pieceLabel?: string | null;
  nutrition: Nutrition;
  lowStockThreshold?: number | null;
  isAlwaysAvailable?: boolean;
  unitConversions?: CustomUnitConversion[];
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageLocationOption {
  _id: string;
  name: string;
}

export interface StoreOption {
  _id: string;
  name: string;
}

export interface PantryItem {
  _id: string;
  ingredient: Ingredient;
  storageLocation: string | StorageLocationOption;
  quantityAvailable: number;
  quantityUnit: string;
  purchaseDate: string;
  openedDate: string | null;
  expiryDate: string | null;
  purchasePrice: number | null;
  store: string | StoreOption | null;
  notes: string;
  isFinished: boolean;
  // Set when isFinished was flipped by an automatic meal-plan-confirm
  // deduction — null when finished some other way (or not finished).
  finishedAt?: string | null;
  finishedByEntry?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PantryResponse {
  success: boolean;
  count: number;
  data: PantryItem[];
}
