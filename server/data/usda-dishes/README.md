# Dish library (USDA FoodData Central, survey foods)

`dishes.json` is Orbit's restaurant dish library: 1,706 generic restaurant-style dishes, loaded by `services/dishLibrary.js`. It gives a restaurant's dish its nutrition when someone adds it: "pad thai with chicken", "pho with beef" or "pepperoni pizza", at a size they pick.

**Source:** U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, Survey Foods (FNDDS 2021–2023, released October 2024), https://fdc.nal.usda.gov/. Public domain (CC0 1.0); USDA asks to be credited as the source.

**What was done to it (October 2026):**

- **Kept:** the restaurant-, café- and bar-style kinds of food: mixed dishes, sandwiches and burgers, pizza, Mexican, Asian, soups, salads, breakfast, sides, desserts, coffee and tea, drinks, alcohol.
- **Left out:**
  - plain foods (those are in the ingredient library, `data/usda-foods`);
  - baby food and formula;
  - school lunch, frozen-meal, canned and diet versions;
  - USDA's near-duplicates: the same dish by cooking fat, skin on or off, home versus restaurant, or USDA's split by which vegetables are included;
  - brand items.
- **Renamed** as a menu would say it, put in a category, given search aliases.
- **Merged:** dishes given the same name became one. The others' USDA ids are kept in `alsoFdcIds`.
- **Per dish:**
  - **nutrition per 100 g** in Orbit's 37 nutrients: omega-3 is EPA + DHA, folate is DFE;
  - **USDA's household measures as units:** cup, piece, slice, sandwich, large pizza and so on, in grams. Survey-only measures were left out ("surface inch", cooking yields, chains' own items).
  - **a typical restaurant serving:**
    - noodle, rice and pasta plates: 2.5 cups
    - pho and ramen bowls: 3 cups
    - pizza: 2 large slices
    - sushi rolls: 8 pieces
    - coffee drinks: 16 fl oz
