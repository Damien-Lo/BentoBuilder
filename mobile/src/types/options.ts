export interface SelectOption {
  _id: string;
  name: string;
}

export interface IngredientOption
  extends SelectOption {
  description?: string;
  unit?: string;
  defaultPortionAmount?: number;

  lowStockThreshold?: number;

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