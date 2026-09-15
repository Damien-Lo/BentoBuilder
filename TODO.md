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

## Known issues (pinned, not urgent)

- **Receipt-review units aren't fully reliable yet** (Sept 6) — after fixing the barcode-scanner's quantity-not-updating and wrong-liquid-nutrition bugs, live-tested the receipt scanner end to end and it's functioning but "not perfect" per real-device testing — units still don't come out right in every case. Not yet diagnosed further; revisit with fresh real-receipt/barcode examples of what specifically comes out wrong.

## Scoped but deferred features

- **User profiles and authentication** — deliberately saved for one of the *last* things to build, not because it's unimportant but because adding it early would block day-to-day development flow (every test/debug pass would have to go through login, multi-user state, etc.) before the base app's actual features are fleshed out. Revisit once the core feature set feels done.
- **Receipt/barcode scanning for piece-labeled ingredients** (Sept 15) — the manual "add to pantry" screen (`mobile/app/pantry/add_by_ingredient.tsx`) now adds piece-based ingredients (steak, fillet, ...) as one row per physical piece, each with its own weight and a price split proportional to weight (see `[[whole-unit-deduction]]`/`pieceLabel` in memory). The receipt scanner and barcode scanner haven't been revisited to match — a scanned line still becomes a single pantry entry with one blended weight, so a receipt showing "3 steaks, $18.47" has no per-piece weights to split across. Probably the right shape: let the receipt-review screen split one matched line into N rows the same way the manual screen now does, when the matched ingredient has a `pieceLabel`. Not started.

## Branch / deploy housekeeping

- `ShoppingMode` and `NutritionTracker` are merged into `WorkingSave` and pushed (Sept 3) — the `planner.tsx`/`mealPlan.ts` conflict (NutritionTracker's extracted `computeDayNutrition` vs ShoppingMode's local extension with restaurant-dish filtering + confirmed-entry exact nutrition) was resolved by porting ShoppingMode's logic into the shared `mealPlan.ts`. Verified: `tsc --noEmit` clean (one pre-existing, unrelated `SwipeableMethods` ref error on both source branches), server boot + route checks passed on both branches' endpoints. A new EAS `preview` build was cut from `WorkingSave` and installed over the real "BentoBuilder" app.
- Shopping Mode (grocery list from meal-plan shortfalls, store grouping, receipt-scan reconciliation) has now been live-device-tested (Sept 6) — functioning, not perfect (see units issue above).
- `RestaurantVisitQuantities` (per-visit dish quantities, Past Visits section, receipt-review rework, barcode-scan fixes — carrying `ReceiptReviewCardFix` along with it) and `MealPhotoEstimate` (photo-based dish nutrition estimation) merged into `WorkingSave` and pushed (Sept 6). All fully-merged feature branches deleted, both locally and on GitHub, to keep the branch list to just `main` and `WorkingSave`.
- `WholePieceMatching` (whole-unit pantry deduction — see `[[whole-unit-deduction]]` in memory for the full writeup, now marked done there) and `RestaurantVisitFlow` (restaurant-as-continuous-tracker rework: revisiting a place no longer duplicates it, a new-entry's macros no longer default to a past visit's whole menu, inline add-a-dish with photo-scan) merged into `WorkingSave` and pushed (Sept 14). Both branched from `WorkingSave` independently (siblings) with only one overlapping file (`mealPlan.ts`), which auto-merged cleanly. Both branches deleted, locally and on GitHub - back down to just `main` and `WorkingSave`.
- **Gotcha worth remembering**: while `WholePieceMatching` was unmerged, the local dev server happened to be running the sibling `RestaurantVisitFlow` branch instead - since that branch's `Recipe.js` had no `matchMode` field, the already-correct DB data for the whole-piece-converted recipes was silently dropped from every API response, making the finished feature look broken/unmerged on-device. Always check which branch a running dev server actually has checked out before concluding a verified feature "isn't working."

## Open data-quality questions (not urgent)

- Several ingredient categories are empty or thin: Fruits (2 real items), Bread & Pastry (1), Beverages & Stock and Snacks & Confectionery (both empty). Worth a gut-check on whether that reflects real habits or just unlogged data.
- No recipe has an image — a blanket gap, not per-recipe.
- 12 branded ingredients still have no barcode — tracked live on the in-app Developer → "Ingredients Missing Data" page, not something to duplicate here; just scan them next time you buy/log one.
