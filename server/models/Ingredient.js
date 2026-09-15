import mongoose from "mongoose";

const nutritionSchema = new mongoose.Schema(
  {
    calories: {
      type: Number,
      min: 0,
      default: null,
    },
    protein: {
      type: Number,
      min: 0,
      default: null,
    },
    carbs: {
      type: Number,
      min: 0,
      default: null,
    },
    fats: {
      type: Number,
      min: 0,
      default: null,
    },
    fiber: {
      type: Number,
      min: 0,
      default: null,
    },
    sodium: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    _id: false,
  },
);

// Same shape as UserProfile's global unitConversions — but scoped to this
// one ingredient (e.g. "1 tbsp = 10 g" for ginger specifically), since
// mass<->volume factors are density-dependent and don't hold across
// unrelated ingredients. Resolution order (see services/unitConversion.js's
// getIngredientConversions): this ingredient's own entries, then its
// genericParent's, then UserProfile's global list as a last-resort fallback.
const unitConversionSchema = new mongoose.Schema(
  {
    unit: { type: String, required: true, trim: true },
    baseUnit: { type: String, required: true, trim: true },
    factor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Ingredient name is required"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientCategory",
      required: true,
    },

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
    },

    // Generic ingredients (e.g. "Soy Sauce") represent the abstract item a
    // recipe asks for. Specific/branded ingredients (e.g. "Kikkoman Soy
    // Sauce") point back at one via genericParent. Hierarchy is one level
    // deep only: a generic can't itself have a genericParent.
    isGeneric: {
      type: Boolean,
      default: false,
    },

    genericParent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      default: null,
    },

    barcode: {
      type: String,
      trim: true,
    },

    defaultPortionAmount: {
      type: Number,
      min: 0,
      default: 1,
    },

    defaultPortionUnit: {
      type: String,
      trim: true,
      default: "serving",
    },

    // Purely a display/grouping label - e.g. "steak" for Filet Mignon,
    // "fillet" for Salmon Fillet. Set only when this ingredient is
    // naturally bought/consumed as discrete, individually-sized pieces
    // (as opposed to a continuous amount like flour or ground beef), so
    // the pantry list can show a piece *count* ("3 steaks") instead of a
    // summed weight ("682 g"). Deliberately carries no weight range of its
    // own - what size counts as "usable" is a per-recipe decision (a
    // recipe wanting an unusually large or small cut is still valid),
    // handled entirely by Recipe.ingredientList's own matchMode/
    // pieceMinWeight/pieceMaxWeight fields, not by anything here.
    pieceLabel: {
      type: String,
      trim: true,
      default: null,
    },

    nutrition: {
      type: nutritionSchema,
      default: () => ({}),
    },

    lowStockThreshold: {
      type: Number,
      min: 0,
      default: null,
    },

    // When true, this ingredient (e.g. tap water) never shows as low/out of
    // stock regardless of pantry quantity — stock tracking is skipped for it.
    isAlwaysAvailable: {
      type: Boolean,
      default: false,
    },

    // Where a new pantry entry for this ingredient usually goes — prefills
    // (doesn't force) the storage location when logging a purchase.
    defaultStorageLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StorageLocation",
      default: null,
    },

    // How long a pantry entry of this ingredient usually lasts, e.g. "2
    // weeks" — prefills the expiry date (purchaseDate + this duration) when
    // logging a purchase. Both fields are set together or not at all.
    defaultExpiryDurationAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    defaultExpiryDurationUnit: {
      type: String,
      enum: ["day", "week", "month", "year", null],
      default: null,
    },

    unitConversions: {
      type: [unitConversionSchema],
      default: [],
    },

    // Optional link to the Recipe that produces this ingredient (e.g. a
    // "Dashi Stock" ingredient made from a "Dashi Stock" recipe). Cooking
    // that recipe (confirming a meal-plan entry for it) deposits pantry
    // stock of this ingredient; any other recipe that calls for this
    // ingredient will, if pantry stock is short, fall back to this
    // ingredient's own recipe for the shortfall (recursively) — see
    // pantryDeduction.ts's expandProducedIngredientRows.
    //
    // Whenever this is set (see RecipeRoutes.js/IngredientRoutes.js),
    // defaultPortionAmount is forced to 1 and defaultPortionUnit is forced
    // to match the recipe's own defaultPortionUnit ("serving" by default)
    // — this is what lets "N servings cooked" equal "N units produced"
    // exactly, so the recipe's own per-serving nutrition (already computed
    // automatically) is directly this ingredient's per-unit nutrition with
    // no conversion needed. See services/productionCycle.js for the cycle
    // check that runs before this can be set.
    productionRecipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      default: null,
    },

    // Only meaningful when productionRecipe is set, and only ever set from
    // the recipe's own "Prepares" section (same rule as productionRecipe
    // itself). true = a finished meal you reheat/eat directly (e.g.
    // Okonomiyaki) — excluded from other recipes' ingredient-list pickers
    // and the "All Your Ingredients" list, since it's never a component of
    // another recipe. false (default) = a component ingredient (e.g. Dashi
    // Stock, Minced Garlic) usable like any store-bought ingredient.
    isMealPrep: {
      type: Boolean,
      default: false,
    },

    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],

    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Keep the generic/specific hierarchy one level deep.
ingredientSchema.pre("validate", function () {
  if (this.isGeneric && this.genericParent) {
    throw new Error(
      "A generic ingredient cannot itself have a genericParent (only one level of hierarchy is allowed)",
    );
  }
});

ingredientSchema.index({ genericParent: 1 });

// Prevent multiple ingredient records from using the same barcode.
// Sparse means ingredients without a barcode are still allowed.
ingredientSchema.index(
  { barcode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      barcode: {
        $type: "string",
        $ne: "",
      },
    },
  },
);
const Ingredient = mongoose.model("Ingredient", ingredientSchema);

export default Ingredient;
