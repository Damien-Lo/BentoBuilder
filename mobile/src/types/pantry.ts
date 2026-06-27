export interface Nutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
  sodium: number | null;
}

export interface Ingredient {
  _id: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  barcode: string | null;
  defaultPortionAmount: number;
  defaultPortionUnit: string;
  nutrition: Nutrition;
  nutritionBasis: "per-serving" | "per-100g";
  imageUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageLocationOption {
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
  lowStockThreshold: number;
  purchasePrice: number | null;
  notes: string;
  isFinished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PantryResponse {
  success: boolean;
  count: number;
  data: PantryItem[];
}
