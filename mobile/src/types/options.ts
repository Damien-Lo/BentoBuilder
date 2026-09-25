import type { DurationUnit } from "@/src/utils/date";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";
import type { PartialNutrition } from "@/src/types/nutrition";

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

  unitConversions?: CustomUnitConversion[];

  lowStockThreshold?: number;
  isAlwaysAvailable?: boolean;

  defaultStorageLocationId?: string;
  defaultStorageLocationName?: string;
  defaultExpiryDurationAmount?: number;
  defaultExpiryDurationUnit?: DurationUnit;

  nutrition?: PartialNutrition;

  categoryId?: string;
  categoryName?: string;

  category?: {
    _id?: string;
    name?: string;
  };
}