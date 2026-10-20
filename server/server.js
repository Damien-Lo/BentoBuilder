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

// (Any key starting with "$", however deep.)
const hasOperator = (value, depth = 0) =>
  depth < 20 && !!value && typeof value === "object" && Object.entries(value).some(([key, inner]) => key.startsWith("$") || hasOperator(inner, depth + 1));
import { ownerScope, signInRequired } from "./services/ownership.js";



dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5050;

// Which websites may call the server from a browser: WEB_ORIGINS, comma
// separated (e.g. https://bentobuilder.pages.dev), each with its preview
// addresses (https://<anything>.bentobuilder.pages.dev). The phone app
// sends no origin and isn't affected. Without WEB_ORIGINS (a developer's
// machine), any.
const webOrigins = (process.env.WEB_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
function allowedOrigin(origin) {
  if (!origin || !webOrigins.length) return true;
  try {
    const host = new URL(origin).hostname;
    return webOrigins.some((allowed) => origin === allowed || (origin.startsWith("https://") && host.endsWith(`.${new URL(allowed).hostname}`)));
  } catch {
    return false;
  }
}
app.use(cors({ origin: (origin, done) => done(null, allowedOrigin(origin)) }));
// The caller's real address, which the sign-in limiter goes by. On Render a
// request comes through three proxies — Cloudflare, Render's load
// balancer, and one on the machine itself (seen Oct 19, 2026) — so the
// address three hops back is the caller's; anything a caller puts in front
// of that is ignored. TRUST_PROXY_HOPS overrides it if Render changes.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || (process.env.RENDER ? 3 : 1));
// Who each request is from, when it carries a session token (req.user),
// and so whose records it reads and writes (see services/ownership.js).
// Without a session it's the admin's until sign-in is required — which it
// is on the deployed server.
app.use(authenticate);
app.use(ownerScope);
// Request bodies: a photo (base64, a few MB) only from someone signed in —
// or anyone, while sign-in isn't required; a little otherwise, so a
// stranger can't make the server hold large bodies.
const smallBody = express.json({ limit: "20kb" });
const largeBody = express.json({ limit: "15mb" });
app.use((req, res, next) => (req.user || !signInRequired() ? largeBody : smallBody)(req, res, next));
// No database instructions ("$set", "$rename"…) in what's sent: some routes
// pass a body to the database as it is, and the app never sends them.
app.use((req, res, next) => (hasOperator(req.body) ? res.status(400).json({ success: false, message: "That request isn't allowed." }) : next()));

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

// Anything that went wrong without a route answering — a body that isn't
// JSON, or too large: a plain message, never the details.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  const status = Number(error.status ?? error.statusCode) || 500;
  if (status >= 500) console.error(`${req.method} ${req.url}:`, error);
  return res.status(status).json({
    success: false,
    message: error.type === "entity.too.large" ? "That's too large to send." : status < 500 ? "That request couldn't be read." : "Something went wrong on the server.",
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