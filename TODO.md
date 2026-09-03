# BentoBuilder TODO

Working notes on what's in progress and what's deferred. Update this as things get done or new things come up — it's meant to be read, not just written.

## Done: MyFitnessPal diary import (Aug 10–30)

Went through the two-week diary item/cluster at a time, adding whatever was missing as ingredients, recipes, or restaurant-meal entries, on branch `ShoppingMode`. All items resolved (added or explicitly skipped) as of Sept 2.

Last items added: Kite Hill Mushroom & Ricotta Ravioli, Real Good Foods Chicken & Pepper Jack Burrito, Squid Sashimi (generic), Pesto (generic, store-bought, Condiments & Sauces).

**Explicitly skipped** (told to forget these, not oversights): Aug 22 sushi lunch cluster (generic Tuna nigiri, Japanese Sweet Shrimp Nigiri Sushi, Wasabi Sushi & Bento Yellow Tail Nigiri, Shushi Salmon Nigiri, Arashi Sushi House Hamachi Sashimi + that day's salmon/tuna sashimi), Aug 19 sashimi dinner cluster (Squid/Scallop/mixed sashimi + that day's salmon/tuna sashimi), Aug 25 Wasabi condiment entry (negligible, not worth tracking), Aug 27 cluster (California sushi roll 4pc, Kantaro Hamachi Nigiri, Aladdin Grilled Salmon Fillets, Greenfield Beef Brisket Premium Shabu Shabu), Aug 23–24 Hong Kong takeout cluster (Foong's Kitchen Crispy Pork Belly, TruGourmet BBQ Pork Belly, Hong Kong Roast Goose, Taste of Hong Kong Beef Brisket, Wonton Noodles, hot & sour soup, Gejang), Aug 28 Goya White Cannellini Beans, Aug 28 grilled Octopus, Aug 28 The Hustle Kitchen Tagliatelle Bolognese.

## Scoped but deferred features

- **Whole-unit pantry deduction** ("use 1 whole fillet, whatever size it is, without splitting across pantry items to hit an exact gram target") — see `[[whole-unit-deduction]]` in memory for the full writeup. Needs new logic in `pantryDeduction.ts`'s brother-grouping/ambiguity-resolution system; deliberately separated from the exact-nutrition-from-`stockDeductions` work (which is done).

## Branch / deploy housekeeping

- Two feature branches sitting unmerged in parallel: `ShoppingMode` (this session's work — data audit tools, Developer section, restaurant browsing + per-dish planner logging, plus the original shopping-list/store-grouping/receipt-reconciliation feature from before) and `NutritionTracker` (Settings section restructure, Health/Nutrition tab, weight tracking). Both branch off `WorkingSave`, which is the actual Render deploy source (not `main`).
- The original Shopping Mode feature itself (grocery list from meal-plan shortfalls, store grouping, receipt-scan reconciliation) still hasn't been tested live on a real device end-to-end.
- Eventually these branches need reconciling/merging into `WorkingSave` — worth deciding merge order given both have touched overlapping files (`planner.tsx` especially).

## Open data-quality questions (not urgent)

- Several ingredient categories are empty or thin: Fruits (2 real items), Bread & Pastry (1), Beverages & Stock and Snacks & Confectionery (both empty). Worth a gut-check on whether that reflects real habits or just unlogged data.
- No recipe has an image — a blanket gap, not per-recipe.
- 12 branded ingredients still have no barcode — tracked live on the in-app Developer → "Ingredients Missing Data" page, not something to duplicate here; just scan them next time you buy/log one.
