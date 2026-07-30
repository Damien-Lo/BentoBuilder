import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import ingredientRoutes from "./routes/ingredientRoutes.js";
import pantryRoutes from "./routes/pantryRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import storageLocationRoutes from "./routes/storageLocationRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import storeRoutes from "./routes/StoreRoutes.js";
import recipeRoutes from "./routes/RecipeRoutes.js";
import recipeCategoryRoutes from "./routes/RecipeCategoryRoutes.js";
import mealRoutes from "./routes/MealRoutes.js";
import mealTagRoutes from "./routes/MealTagRoutes.js";
import mealPlanRoutes from "./routes/MealPlanRoutes.js";
import userProfileRoutes from "./routes/UserProfileRoutes.js";
import groceryListRoutes from "./routes/GroceryListRoutes.js";



dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5050;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "BentoBuilder API is running",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});





app.use("/api/ingredients", ingredientRoutes);
app.use("/api/pantry", pantryRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/storage-locations", storageLocationRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/recipe-categories", recipeCategoryRoutes);
app.use("/api/meals", mealRoutes);
app.use("/api/meal-tags", mealTagRoutes);
app.use("/api/meal-plan", mealPlanRoutes);
app.use("/api/profile", userProfileRoutes);
app.use("/api/grocery-list", groceryListRoutes);


app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB Atlas");
    console.log(`Database: ${mongoose.connection.name}`);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`BentoBuilder server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();