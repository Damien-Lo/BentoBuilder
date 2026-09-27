import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  ALL_NUTRITION_FIELDS,
  CORE_NUTRITION_FIELDS,
  NUTRITION_FIELD_META,
  type NullableNutrition,
  type NutritionField,
} from "@/src/types/nutrition";

// Open Food Facts' own nutriment key for each of our fields, and the factor
// from OFF's normalized unit to ours. OFF's `_100g`/`_serving` values are
// always normalized to grams (kcal for energy) regardless of what unit the
// contributor typed in — checked against real products (e.g. a Mars bar's
// vitamin-a_100g = 4.94e-05, i.e. 49.4 mcg; skyr's calcium_100g = 0.11,
// i.e. 110 mg) — so mg fields are x1000 and mcg fields x1e6. A list of keys
// is summed (omega3 = EPA + DHA, which OFF keeps separately). Typed as a
// full Record so adding a nutrient to types/nutrition.ts won't compile
// until it's mapped here too.
const MG = 1000;
const MCG = 1_000_000;
const OFF_NUTRIENTS: Record<NutritionField, { key: string | string[]; factor: number }> = {
  calories:           { key: "energy-kcal",         factor: 1 },
  protein:            { key: "proteins",            factor: 1 },
  carbs:              { key: "carbohydrates",       factor: 1 },
  fats:               { key: "fat",                 factor: 1 },
  fiber:              { key: "fiber",               factor: 1 },
  sodium:             { key: "sodium",              factor: MG },
  sugar:              { key: "sugars",              factor: 1 },
  addedSugar:         { key: "added-sugars",        factor: 1 },
  saturatedFat:       { key: "saturated-fat",       factor: 1 },
  polyunsaturatedFat: { key: "polyunsaturated-fat", factor: 1 },
  monounsaturatedFat: { key: "monounsaturated-fat", factor: 1 },
  transFat:           { key: "trans-fat",           factor: 1 },
  omega3:             { key: ["eicosapentaenoic-acid", "docosahexaenoic-acid"], factor: MG },
  cholesterol:        { key: "cholesterol",         factor: MG },
  potassium:          { key: "potassium",           factor: MG },
  vitaminA:           { key: "vitamin-a",           factor: MCG },
  vitaminC:           { key: "vitamin-c",           factor: MG },
  vitaminD:           { key: "vitamin-d",           factor: MCG },
  vitaminE:           { key: "vitamin-e",           factor: MG },
  vitaminK:           { key: "vitamin-k",           factor: MCG },
  thiamin:            { key: "vitamin-b1",          factor: MG },
  riboflavin:         { key: "vitamin-b2",          factor: MG },
  niacin:             { key: "vitamin-pp",          factor: MG },
  vitaminB6:          { key: "vitamin-b6",          factor: MG },
  folate:             { key: "vitamin-b9",          factor: MCG },
  vitaminB12:         { key: "vitamin-b12",         factor: MCG },
  choline:            { key: "choline",             factor: MG },
  calcium:            { key: "calcium",             factor: MG },
  iron:               { key: "iron",                factor: MG },
  magnesium:          { key: "magnesium",           factor: MG },
  phosphorus:         { key: "phosphorus",          factor: MG },
  zinc:               { key: "zinc",                factor: MG },
  selenium:           { key: "selenium",            factor: MCG },
  iodine:             { key: "iodine",              factor: MCG },
  copper:             { key: "copper",              factor: MG },
  manganese:          { key: "manganese",           factor: MG },
  caffeine:           { key: "caffeine",            factor: MG },
};

export interface ScannedProduct {
  name: string;
  barcode: string;
  brand?: string;
  packageQuantity?: number;
  packageUnit?: string;
  servingSize: number;
  servingUnit: string;
  // True when Open Food Facts had no usable per-serving data for this
  // product (or its declared serving was suspiciously close to the whole
  // package - a common mislabeling for bulk/dry goods, e.g. spice jars),
  // so servingSize/servingUnit above are just the 100g/100ml nutrition-
  // label reference amount rather than a real per-use serving. Callers
  // should generally NOT copy servingSize/servingUnit into a form's own
  // default-serving field when this is true - 100 (of whatever the
  // package's own unit is) is not a real serving for most products, and
  // is actively wrong for anything not naturally measured by weight.
  servingIsEstimated: boolean;
  // Per servingSize/servingUnit above, already in our own units and
  // rounded per NUTRITION_FIELD_META. Absent when the lookup found nothing
  // usable (not found / no name / network failure).
  nutrition?: NullableNutrition;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onProductFound: (product: ScannedProduct) => void;
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onProductFound,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [looking, setLooking] = useState(false);
  const processingRef = useRef(false);

  async function handleBarcode({ data }: { type: string; data: string }) {
    if (processingRef.current || looking) return;
    processingRef.current = true;
    setLooking(true);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(data)}.json`,
      );
      const json = (await res.json()) as {
        status: number;
        product?: Record<string, unknown>;
      };

      console.log(`Scanned barcode: ${data}, lookup status: ${json.status}`);
      console.log("Product data:", json);

      if (json.status !== 1 || !json.product) {
        Alert.alert(
          "Product not found",
          "This barcode wasn't in the database. You can still add it manually — the barcode will be saved so it's recognized next time.",
          [
            { text: "Cancel", style: "cancel", onPress: onClose },
            {
              text: "Continue",
              onPress: () => {
                onProductFound({ name: "", barcode: data, servingSize: 1, servingUnit: "", servingIsEstimated: true });
                onClose();
              },
            },
          ],
        );
        return;
      }

      const p = json.product;
      const nutriments = (p.nutriments ?? {}) as Record<string, unknown>;

      // Package total — computed early (moved up from further below) since
      // the serving-size sanity check just below needs it.
      const pkgQty = p.product_quantity != null ? parseFloat(String(p.product_quantity)) : NaN;
      const pkgUnit = String(p.product_quantity_unit ?? "g").trim() || "g";

      // Serving size — numeric grams per serving. A declared serving that's
      // suspiciously close to (or bigger than) the whole package is almost
      // always a mislabeled entry rather than a real serving — common for
      // bulk/dry goods (spice jars, etc.) that don't have a natural
      // discrete serving, where a contributor enters the container's total
      // instead. Treat that the same as no serving data at all rather than
      // let it become "1 serving = the whole product".
      const rawServingQty =
        p.serving_quantity != null
          ? parseFloat(String(p.serving_quantity))
          : NaN;
      const servingLooksLikeWholePackage =
        Number.isFinite(pkgQty) && pkgQty > 0 && Number.isFinite(rawServingQty) && rawServingQty >= pkgQty * 0.9;
      const hasServing = Number.isFinite(rawServingQty) && rawServingQty > 0 && !servingLooksLikeWholePackage;
      const servingQty = hasServing ? rawServingQty : NaN;
      // Not a real per-serving amount when !hasServing — see
      // ScannedProduct.servingIsEstimated. Kept at 100 (rather than left
      // blank) purely so getNum's per-100g scaling below still has a
      // consistent reference amount to divide by.
      const portionAmount = hasServing ? servingQty : 100;

      // Open Food Facts uses several suffix variants depending on product type:
      // _prepared_serving (cooked/instant foods), _serving, _prepared_100g, _100g
      function getNum(key: string): number | undefined {
        const candidates = hasServing
          ? [
              nutriments[key + "_prepared_serving"],
              nutriments[key + "_serving"],
            ]
          : [];
        for (const v of candidates) {
          if (typeof v === "number" && Number.isFinite(v)) return v;
        }
        // Fall back to per-100g variants, scaled to serving size
        const per100Candidates = [
          nutriments[key + "_prepared_100g"],
          nutriments[key + "_100g"],
        ];
        for (const v of per100Candidates) {
          if (typeof v === "number" && Number.isFinite(v)) {
            return hasServing ? (v / 100) * servingQty : v;
          }
        }
        return undefined;
      }

      const nutrition = {} as NullableNutrition;
      for (const field of CORE_NUTRITION_FIELDS) nutrition[field] = null;
      for (const field of ALL_NUTRITION_FIELDS) {
        const { key, factor } = OFF_NUTRIENTS[field];
        const parts = (Array.isArray(key) ? key : [key])
          .map((k) => getNum(k))
          .filter((n): n is number => n != null);
        if (parts.length === 0) continue;
        const raw = parts.reduce((sum, n) => sum + n, 0);
        const decimals = 10 ** NUTRITION_FIELD_META[field].decimals;
        nutrition[field] = Math.round(raw * factor * decimals) / decimals;
      }

      // Brand — take the first brand when multiple are comma-separated
      const rawBrand = String(p.brands ?? "").trim();
      const brand = rawBrand ? rawBrand.split(",")[0].trim() : undefined;

      const name = String(p.product_name_en ?? p.product_name ?? "").trim();

      if (!name) {
        Alert.alert(
          "No product name",
          "Barcode found, but it has no name on file. You can still add it manually — the barcode will be saved so it's recognized next time.",
          [
            { text: "Cancel", style: "cancel", onPress: onClose },
            {
              text: "Continue",
              onPress: () => {
                onProductFound({
                  name: "",
                  barcode: data,
                  brand: brand || undefined,
                  servingSize: 1,
                  servingUnit: "",
                  servingIsEstimated: true,
                });
                onClose();
              },
            },
          ],
        );
        return;
      }

      onProductFound({
        name,
        barcode: data,
        brand: brand || undefined,
        packageQuantity: Number.isFinite(pkgQty) && pkgQty > 0 ? pkgQty : undefined,
        packageUnit: pkgUnit,
        servingSize: portionAmount,
        servingIsEstimated: !hasServing,
        // A real declared serving_quantity shares the package's own unit
        // system (g for solids, ml for liquids - Open Food Facts doesn't
        // report a separate unit for serving_quantity, but it's always in
        // the same system as product_quantity_unit). Hardcoding "g" here
        // broke every liquid product: a serving genuinely in ml labeled
        // "g" can't be reconciled against the row's real unit, so it
        // silently fell back to a bogus 1:1 conversion and the nutrition
        // came out wildly wrong. The no-serving-data fallback (100 g) is
        // unaffected - Open Food Facts' own _100g-suffixed fields are that
        // convention regardless of product type.
        servingUnit: hasServing ? pkgUnit : "g",
        nutrition,
      });
      onClose();
    } catch {
      Alert.alert(
        "Lookup failed",
        "Could not reach the product database. You can still add it manually — the barcode will be saved so it's recognized next time.",
        [
          { text: "Cancel", style: "cancel", onPress: onClose },
          {
            text: "Continue",
            onPress: () => {
              onProductFound({ name: "", barcode: data, servingSize: 1, servingUnit: "", servingIsEstimated: true });
              onClose();
            },
          },
        ],
      );
    } finally {
      setLooking(false);
      processingRef.current = false;
    }
  }

  if (!visible) return null;

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <SafeAreaView className="flex-1 items-center justify-center bg-black px-8">
          <Ionicons name="camera-outline" size={48} color="white" />
          <Text className="mt-4 text-center text-lg font-bold text-white">
            Camera access needed
          </Text>
          <Text className="mt-2 text-center text-slate-400">
            Allow camera access to scan barcodes.
          </Text>
          <Pressable
            className="mt-6 rounded-2xl bg-blue-600 px-8 py-3"
            onPress={() => void requestPermission()}
          >
            <Text className="font-bold text-white">Allow camera</Text>
          </Pressable>
          <Pressable className="mt-4" onPress={onClose}>
            <Text className="text-slate-400">Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* Padded black border on every side — the camera never touches the
          screen edges, and the close button lives outside the camera view
          entirely rather than overlaid on top of it, so it can't end up
          obscured by or fighting the camera feed/status bar for space.
          bg-black lives on this plain View (not the SafeAreaView below) —
          background color doesn't reliably apply via className directly
          on SafeAreaView here. */}
      <View className="flex-1 bg-black">
        <SafeAreaView className="flex-1 p-4">
          <View className="flex-row items-center pb-3">
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
            <Text className="ml-3 text-lg font-bold text-white">
              Scan barcode
            </Text>
          </View>

          <View className="flex-1 overflow-hidden rounded-3xl bg-slate-900">
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={looking ? undefined : handleBarcode}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
              }}
            />

            {/* Viewfinder */}
            <View className="flex-1 items-center justify-center">
              <View className="h-44 w-72 rounded-2xl border-2 border-white/80" />
              <Text className="mt-4 text-sm text-white/70">
                Point the camera at a product barcode
              </Text>
            </View>

            {/* Lookup overlay */}
            {looking && (
              <View
                style={StyleSheet.absoluteFillObject}
                className="items-center justify-center bg-black/70"
              >
                <ActivityIndicator size="large" color="white" />
                <Text className="mt-3 text-white">Looking up product…</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
