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

    nutrition: {
      type: nutritionSchema,
      default: () => ({}),
    },

    nutritionBasis: {
      type: String,
      enum: ["per-serving", "per-100g"],
      default: "per-serving",
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
