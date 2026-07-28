import type { DurationUnit } from "@/src/utils/date";

export interface SelectOption {
  _id: string;
  name: string;
}

export interface IngredientOption
  extends SelectOption {
  description?: string;
  barcode?: string | null;
  unit?: string;
  defaultPortionAmount?: number;

  isGeneric?: boolean;

  brandId?: string;
  brandName?: string;

  genericParentId?: string;
  genericParentName?: string;

  lowStockThreshold?: number;
  isAlwaysAvailable?: boolean;

  defaultStorageLocationId?: string;
  defaultStorageLocationName?: string;
  defaultExpiryDurationAmount?: number;
  defaultExpiryDurationUnit?: DurationUnit;

  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sodium?: number;

  categoryId?: string;
  categoryName?: string;

  category?: {
    _id?: string;
    name?: string;
  };
}