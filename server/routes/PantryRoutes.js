import express from "express";
import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";

const router = express.Router();

/**
 * GET /api/pantry
 * Return all pantry records and their ingredient details.
 */
router.get("/", async (req, res) => {
  try {
    const pantryItems = await PantryItem.find({
        isFinished: false,
        })
        .populate({
            path: "ingredient",
            populate: {
            path: "category",
            },
        })
        .populate("storageLocation")
        .sort({
            expiryDate: 1,
            createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: pantryItems.length,
      data: pantryItems,
    });
  } catch (error) {
    console.error("Get pantry error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pantry items",
    });
  }
});

/**
 * GET /api/pantry/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const pantryItem = await PantryItem.findById(req.params.id).populate(
      "ingredient"
    );

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid pantry item ID",
    });
  }
});

/**
 * POST /api/pantry
 * Add an existing ingredient to the pantry.
 */
router.post("/", async (req, res) => {
  try {
    const ingredientExists = await Ingredient.exists({
      _id: req.body.ingredient,
      isArchived: false,
    });

    if (!ingredientExists) {
      return res.status(404).json({
        success: false,
        message: "Referenced ingredient does not exist",
      });
    }

    const pantryItem = await PantryItem.create(req.body);

    await pantryItem.populate("ingredient");

    return res.status(201).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    console.error("Create pantry item error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});


/**
 * POST /api/pantry/create
 *
 * Creates an Ingredient and immediately adds it to the pantry.
 */
router.post("/create", async (req, res) => {
  let ingredient = null;

  try {
    const {
      name,
      description,
      category,
      brand,
      barcode,
      storageLocation,
      quantityAvailable,
      quantityUnit,
      purchaseDate,
      expiryDate,
      purchasePrice,
      lowStockThreshold,
      notes,
      nutrition,
      nutritionBasis,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Ingredient name is required",
      });
    }

    ingredient = await Ingredient.create({
      name: name.trim(),
      description: description?.trim() ?? "",
      category,
      brand: brand?.trim() ?? "",
      barcode: barcode?.trim() || undefined,
      nutrition: nutrition || {},
      nutritionBasis: nutritionBasis || "per-serving",
    });

    const pantryItem = await PantryItem.create({
      ingredient: ingredient._id,
      storageLocation,
      quantityAvailable: Number(quantityAvailable),
      quantityUnit: quantityUnit.trim(),
      purchaseDate: purchaseDate || undefined,
      expiryDate: expiryDate || null,
      purchasePrice:
        purchasePrice === "" || purchasePrice === undefined
          ? null
          : Number(purchasePrice),
      lowStockThreshold:
        lowStockThreshold === "" || lowStockThreshold === undefined
          ? 0
          : Number(lowStockThreshold),
      notes: notes?.trim() ?? "",
    });

    await pantryItem.populate([
      {
        path: "ingredient",
        populate: {
          path: "category",
        },
      },
      {
        path: "storageLocation",
      },
    ]);

    return res.status(201).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    console.error("Create pantry ingredient error:", error);

    if (ingredient?._id) {
      await Ingredient.findByIdAndDelete(ingredient._id).catch(() => {});
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});




/**
 * PATCH /api/pantry/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const pantryItem = await PantryItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).populate("ingredient");

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/pantry/:id/use
 * Deduct an amount when an ingredient is used in a dish or bento.
 */
router.post("/:id/use", async (req, res) => {
  try {
    const amountUsed = Number(req.body.amount);

    if (!Number.isFinite(amountUsed) || amountUsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be a positive number",
      });
    }

    const pantryItem = await PantryItem.findById(req.params.id);

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    if (amountUsed > pantryItem.quantityAvailable) {
      return res.status(400).json({
        success: false,
        message: "Not enough quantity is available",
      });
    }

    pantryItem.quantityAvailable -= amountUsed;

    if (pantryItem.quantityAvailable === 0) {
      pantryItem.isFinished = true;
    }

    await pantryItem.save();
    await pantryItem.populate("ingredient");

    return res.status(200).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    console.error("Use pantry item error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/pantry/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const pantryItem = await PantryItem.findByIdAndDelete(req.params.id);

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pantry item deleted",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid pantry item ID",
    });
  }
});

export default router;