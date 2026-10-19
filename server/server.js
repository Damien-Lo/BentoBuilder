import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import ingredientRoutes from "./routes/IngredientRoutes.js";
import pantryRoutes from "./routes/PantryRoutes.js";
import categoryRoutes from "./routes/CategoryRoutes.js";
import storageLocationRoutes from "./routes/StorageLocationRoutes.js";
import brandRoutes from "./routes/BrandRoutes.js";
import storeRoutes from "./routes/StoreRoutes.js";
import recipeRoutes from "./routes/RecipeRoutes.js";
import recipeCategoryRoutes from "./routes/RecipeCategoryRoutes.js";
import mealRoutes from "./routes/MealRoutes.js";
import tagRoutes from "./routes/TagRoutes.js";
import usualMealRoutes from "./routes/UsualMealRoutes.js";
import mealPlanRoutes from "./routes/MealPlanRoutes.js";
import restaurantMealRoutes from "./routes/RestaurantMealRoutes.js";
import userProfileRoutes from "./routes/UserProfileRoutes.js";
import groceryListRoutes from "./routes/GroceryListRoutes.js";
import receiptRoutes from "./routes/ReceiptRoutes.js";
import deviceRoutes from "./routes/DeviceRoutes.js";
import captureRoutes from "./routes/CaptureRoutes.js";
import weightEntryRoutes from "./routes/WeightEntryRoutes.js";
import todoRoutes from "./routes/TodoRoutes.js";
import calendarRoutes from "./routes/CalendarRoutes.js";
import { chosenDatabase, connectDatabase, DATABASES } from "./config/database.js";
import developerRoutes from "./routes/DeveloperRoutes.js";
import photoRoutes from "./routes/PhotoRoutes.js";
import menuRoutes from "./routes/MenuRoutes.js";
import authRoutes from "./routes/AuthRoutes.js";
import { adminOrNoAccount, authenticate } from "./services/auth.js";
import { ownerScope } from "./services/ownership.js";



dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5050;

app.use(cors());
// Default express.json() limit (~100kb) is too small for a base64-encoded
// receipt photo (a few MB) — raised here since the global parser runs
// before any route-level override would ever see the request.
app.use(express.json({ limit: "15mb" }));
// (Render sits in front of the server: the caller's address is the one it
// passes on, which the sign-in limiter goes by.)
app.set("trust proxy", 1);
// Who each request is from, when it carries a session token (req.user),
// and so whose records it reads and writes (see services/ownership.js).
// Without a session it's the admin's, until REQUIRE_SIGN_IN=true.
app.use(authenticate);
app.use(ownerScope);

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
app.use("/api/tags", tagRoutes);
app.use("/api/meal-plan", mealPlanRoutes);
app.use("/api/usual-meals", usualMealRoutes);
app.use("/api/restaurant-meals", restaurantMealRoutes);
app.use("/api/profile", userProfileRoutes);
app.use("/api/grocery-list", groceryListRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/capture", captureRoutes);
app.use("/api/weight-entries", weightEntryRoutes);
app.use("/api/todo", todoRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/developer", adminOrNoAccount, developerRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/auth", authRoutes);


app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

async function startServer() {
  try {
    // The real data — or, on a developer's machine, whichever of the real
    // and test data was last chosen (config/database.js).
    const which = await connectDatabase(chosenDatabase());

    console.log("Connected to MongoDB Atlas");
    console.log(`Database: ${mongoose.connection.name} (${DATABASES[which].label.toLowerCase()})`);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`BentoBuilder server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();