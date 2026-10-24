# Food library (USDA FoodData Central)

`foods.json` is Orbit's food library: 3,270 generic foods, loaded as shared
ingredients by `services/foodLibrary.js` when the server connects.

**Source:** U.S. Department of Agriculture, Agricultural Research Service.
FoodData Central, https://fdc.nal.usda.gov/

- SR Legacy, April 2018 release
- Foundation Foods, April 2026 release

FoodData Central data is in the public domain (CC0 1.0). It can be used,
changed and shipped without permission. USDA asks that it be cited as the
source, as above.

**What was done to it (October 2026):**

- **Left out:** baby food, fast food, restaurant dishes, branded items,
  industrial and lab records, and near-duplicates. These include the salted
  twins of cooked foods, grade and lean-only variants of meat, and offal other
  than liver.
- **Renamed** for the app, e.g. "Chicken, broilers or fryers, breast, meat
  only, raw" became "Chicken breast, raw". Each food was sorted into Orbit's
  ingredient categories and given search aliases.
- **Merged:** foods given the same name became one food. The Foundation
  record comes first; the other USDA ids are kept in `alsoFdcIds`, and USDA's
  own description in `sourceName`.
- **Default portions:**

  | Kind of food | Default |
  |---|---|
  | Counted foods | 1 piece, at the medium size (large for eggs) |
  | Meat and fish | 100 g |
  | Oils, sauces and condiments | 1 tbsp |
  | Spices | 1 tsp |
  | Drinks, milk and stock | 1 cup |
  | Alcohol | 1 shot, glass or can |
  | Everything else | 100 g |

  The nutrition is scaled to the default portion. The unit conversions
  include USDA's household measures: cup, tbsp, tsp and ml weights, piece
  sizes, slices and so on.
- **Nutrients** are mapped to Orbit's 37, in the units of
  `models/nutritionSchema.js`. Omega-3 is EPA + DHA only. Folate is DFE where
  USDA gives it. Added sugar is left blank, because USDA doesn't give it for
  these foods.
