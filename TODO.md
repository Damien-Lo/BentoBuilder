# BentoBuilder TODO

Working notes on what's in progress and what's deferred. Update this as things get done or new things come up — it's meant to be read, not just written.

## Done: MyFitnessPal diary import (Aug 10–30)

Went through the two-week diary item/cluster at a time, adding whatever was missing as ingredients, recipes, or restaurant-meal entries, on branch `ShoppingMode`. All items resolved (added or explicitly skipped) as of Sept 2.

Last items added: Kite Hill Mushroom & Ricotta Ravioli, Real Good Foods Chicken & Pepper Jack Burrito, Squid Sashimi (generic), Pesto (generic, store-bought, Condiments & Sauces).

**Explicitly skipped** (told to forget these, not oversights): Aug 22 sushi lunch cluster (generic Tuna nigiri, Japanese Sweet Shrimp Nigiri Sushi, Wasabi Sushi & Bento Yellow Tail Nigiri, Shushi Salmon Nigiri, Arashi Sushi House Hamachi Sashimi + that day's salmon/tuna sashimi), Aug 19 sashimi dinner cluster (Squid/Scallop/mixed sashimi + that day's salmon/tuna sashimi), Aug 25 Wasabi condiment entry (negligible, not worth tracking), Aug 27 cluster (California sushi roll 4pc, Kantaro Hamachi Nigiri, Aladdin Grilled Salmon Fillets, Greenfield Beef Brisket Premium Shabu Shabu), Aug 23–24 Hong Kong takeout cluster minus Gejang (Foong's Kitchen Crispy Pork Belly, TruGourmet BBQ Pork Belly, Hong Kong Roast Goose, Taste of Hong Kong Beef Brisket, Wonton Noodles, hot & sour soup), Aug 28 Goya White Cannellini Beans, Aug 28 grilled Octopus, Aug 28 The Hustle Kitchen Tagliatelle Bolognese.

**Caught after the fact (Sept 3):** Gejang (Spicy Raw Crab, from the Aug 23–24 cluster above) turned out to be home-eaten (H Mart, not a restaurant item) — added as a generic ingredient. Rice already existed. If anything else from that cluster turns out to also be home-eaten rather than restaurant, it can be pulled out and added the same way.

**Backfilled into the meal planner (Sept 3):** the whole Aug 10–30 diary was replayed as real `MealPlanEntry` records (status `confirmed`, no pantry deduction — see `server/manual_controls/scripts/import_myfitnesspal_diary.js`), and the grocery list was wiped clean as a fresh start for real daily use. Also added along the way: generic `Pasta` and `Fish Cake` ingredients, and caught that Aug 15's "Eurest Fried Brussels Sprouts" + "Silverlake Ramen Tsukemen" diary lines were actually the Okiboru visit (exact calorie match on Shoyu Brussels/Paitan Tsukemen), not separate missing items.

Still genuinely unresolved (nothing in the catalog to map to):
- Starbucks Unsweetened Iced Coffee (Aug 15) — no coffee ingredient exists.
- Aug 27 lunch remainder — a handful of individual nigiri/tempura pieces (~472cal) that don't match any restaurant dish or standalone ingredient.

## Scoped but deferred features

- **Whole-unit pantry deduction** ("use 1 whole fillet, whatever size it is, without splitting across pantry items to hit an exact gram target") — see `[[whole-unit-deduction]]` in memory for the full writeup. Needs new logic in `pantryDeduction.ts`'s brother-grouping/ambiguity-resolution system; deliberately separated from the exact-nutrition-from-`stockDeductions` work (which is done).

## Branch / deploy housekeeping

- `ShoppingMode` and `NutritionTracker` are merged into `WorkingSave` and pushed (Sept 3) — the `planner.tsx`/`mealPlan.ts` conflict (NutritionTracker's extracted `computeDayNutrition` vs ShoppingMode's local extension with restaurant-dish filtering + confirmed-entry exact nutrition) was resolved by porting ShoppingMode's logic into the shared `mealPlan.ts`. Verified: `tsc --noEmit` clean (one pre-existing, unrelated `SwipeableMethods` ref error on both source branches), server boot + route checks passed on both branches' endpoints. A new EAS `preview` build was cut from `WorkingSave` and installed over the real "BentoBuilder" app.
- Shopping Mode (grocery list from meal-plan shortfalls, store grouping, receipt-scan reconciliation) is now live on the real app but still not live-device-tested end to end — that's the next thing to actually try.

## Open data-quality questions (not urgent)

- Several ingredient categories are empty or thin: Fruits (2 real items), Bread & Pastry (1), Beverages & Stock and Snacks & Confectionery (both empty). Worth a gut-check on whether that reflects real habits or just unlogged data.
- No recipe has an image — a blanket gap, not per-recipe.
- 12 branded ingredients still have no barcode — tracked live on the in-app Developer → "Ingredients Missing Data" page, not something to duplicate here; just scan them next time you buy/log one.
