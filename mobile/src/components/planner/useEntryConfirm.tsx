import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "react-native";

import { RateAndConfirmModal } from "@/src/components/planner/RateAndConfirmModal";
import { ResolveIngredientSourcesModal } from "@/src/components/planner/ResolveIngredientSourcesModal";
import { addIngredientScore, type Ingredient } from "@/src/services/ingredientApi";
import { confirmMealPlanEntry, type ConfirmedNutrition, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { addRecipeScore, type Recipe } from "@/src/services/recipeApi";
import type { AppSettings } from "@/src/services/settingsService";
import type { PantryItem } from "@/src/types/pantry";
import { computeConfirmNutrition } from "@/src/utils/mealPlan";
import {
  applyAmountOverrides,
  buildIngredientRequirements,
  getDefaultDeductionInstructions,
  getExpandedRows,
  getResolvedDeductionInstructions,
  hasAmbiguity,
  requirementNeedsResolution,
  type AmountOverride,
  type DeductionInstruction,
  type IngredientRequirement,
  type ManualPieceInput,
} from "@/src/utils/pantryDeduction";
import { shouldAutoPromptRating, updateRatingPrompt, type RatingPromptAction } from "@/src/utils/ratingPrompt";

// Marking a planned entry as eaten: works out what comes out of the pantry,
// asks which source to use when there's a real choice, optionally asks for a
// rating, then confirms. One implementation, used by the planner and by a
// meal's page in the calendar, so both deduct stock the same way.
//
// The caller supplies the kitchen data it has loaded and renders `modals`
// somewhere on its screen. It must also say when that data is `ready`:
// confirming against recipes, ingredients or a pantry that hadn't arrived
// yet used to go through quietly, deducting nothing and storing nutrition
// for only part of the food. A confirm asked for too early now waits.
export function useEntryConfirm({
  allRecipes,
  allIngredients,
  pantryItems,
  settings,
  ready,
  onStart,
  onConfirmed,
}: {
  allRecipes: Recipe[];
  allIngredients: Ingredient[];
  pantryItems: PantryItem[];
  settings: AppSettings | null;
  // Recipes, ingredients, pantry and settings have all loaded.
  ready: boolean;
  // The confirm for this entry is under way (the planner closes its swipe row).
  onStart?: (entry: MealPlanEntry) => void;
  // The entry as the server now has it, confirmed.
  onConfirmed: (updated: MealPlanEntry) => void;
}): {
  // `rateFirst`: ask for a rating (when one is due) before confirming.
  confirm: (entry: MealPlanEntry, rateFirst?: boolean) => void;
  // Always ask for a rating, then confirm.
  openRateAndConfirm: (entry: MealPlanEntry) => void;
  modals: ReactNode;
} {
  // Rate-then-confirm overlay for a planned recipe entry — swiping it reveals
  // a "Rate" button alongside the plain "Confirm" one. Also used, in the
  // opposite order (resolve piece size first, then rate), when adding an
  // entry directly as confirmed — see handleConfirmEntry's rateFirst param.
  const [rateConfirmEntry, setRateConfirmEntry] = useState<MealPlanEntry | null>(null);
  const [ratingSaving, setRatingSaving] = useState(false);
  // Set only for the "rate after resolving" order — holds everything
  // finishRating needs to actually confirm once rating is done/skipped, so
  // it isn't recomputed (and doesn't need to re-derive whether resolution
  // was needed) after the rating step closes.
  const [pendingRatingConfirm, setPendingRatingConfirm] = useState<{
    entry: MealPlanEntry;
    instructions: DeductionInstruction[];
    manualPieceEntries: ManualPieceInput[];
    confirmedNutrition: ConfirmedNutrition;
  } | null>(null);

  // Resolve-sources overlay — only shown when confirming an entry whose
  // pantry deduction has a genuine choice (2+ possible sources) for at
  // least one ingredient.
  const [pendingConfirmEntry, setPendingConfirmEntry] = useState<MealPlanEntry | null>(null);
  // The full requirement list for pendingConfirmEntry — needed so resolving
  // just the ambiguous ones (below) can still auto-drain everything else
  // instead of silently skipping it. ambiguousRequirements is the filtered
  // subset actually rendered in the resolve-sources overlay.
  const [pendingRequirements, setPendingRequirements] = useState<IngredientRequirement[]>([]);
  const [ambiguousRequirements, setAmbiguousRequirements] = useState<IngredientRequirement[]>([]);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingSaving, setResolvingSaving] = useState(false);
  // Whether resolving pendingConfirmEntry's ambiguity should lead straight
  // to confirming (the manual toggle/swipe path) or to the rating prompt
  // first (the "just added, already confirmed" path) — see handleConfirmEntry.
  const [pendingRateFirst, setPendingRateFirst] = useState(false);

  // A confirm asked for before the kitchen data was ready, run once it is.
  const [queued, setQueued] = useState<{ entry: MealPlanEntry; rateFirst: boolean } | null>(null);
  useEffect(() => {
    if (!queued) return;
    if (ready) {
      setQueued(null);
      handleConfirmEntry(queued.entry, queued.rateFirst);
      return;
    }
    // Still nothing after a while: say so rather than leave it hanging.
    const timer = setTimeout(() => {
      setQueued(null);
      Alert.alert(
        "Couldn't mark as eaten",
        "Your pantry and recipes haven't loaded, so nothing was changed. Check your connection and try again.",
      );
    }, 20_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, ready]);

  const ingredientMap = useMemo(() => new Map(allIngredients.map(i => [i._id, i])), [allIngredients]);
  const recipeMap = useMemo(() => new Map(allRecipes.map(r => [r._id, r])), [allRecipes]);

  async function performConfirm(
    entry: MealPlanEntry,
    instructions: DeductionInstruction[],
    manualPieceEntries: ManualPieceInput[] = [],
    confirmedNutrition?: ConfirmedNutrition,
  ) {
    onStart?.(entry);
    try {
      const updated = await confirmMealPlanEntry(entry._id, instructions, manualPieceEntries, confirmedNutrition);
      onConfirmed(updated);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not confirm.");
    }
  }

  // Whether adding this as already-eaten should ask for a rating: only for a
  // recipe or directly-logged ingredient, and only when it's due (never
  // rated, changed since, or not rated for a while — see
  // utils/ratingPrompt.ts). A meal or restaurant visit just confirms.
  function wantsAutoRating(entry: MealPlanEntry): boolean {
    const timing = settings
      ? {
          cooldownDays: settings.ratingCooldownDays,
          settledCooldownDays: settings.ratingSettledCooldownDays,
          skipBackoffDays: settings.ratingSkipBackoffDays,
        }
      : undefined;
    if (entry.recipe) return shouldAutoPromptRating(entry.recipe, Date.now(), timing);
    if (entry.ingredient) return shouldAutoPromptRating(entry.ingredient, Date.now(), timing);
    return false;
  }

  // Once instructions/nutrition are settled (no ambiguity, or the overlay
  // just resolved it), either confirm right away (the manual toggle/swipe
  // path) or — rateFirst — prompt for a rating first, skippable, since
  // adding something already-confirmed has no separate gesture prompting
  // for one and is exactly where a rating is easiest to forget. Recipes and
  // directly-logged ingredients (e.g. a protein shake) get rated — a
  // restaurant visit or multi-course meal just confirms.
  function finishConfirm(
    entry: MealPlanEntry,
    instructions: DeductionInstruction[],
    manualPieceEntries: ManualPieceInput[],
    confirmedNutrition: ConfirmedNutrition,
    rateFirst: boolean,
  ) {
    if (rateFirst && wantsAutoRating(entry)) {
      setPendingRatingConfirm({ entry, instructions, manualPieceEntries, confirmedNutrition });
      setRateConfirmEntry(entry);
      return;
    }
    void performConfirm(entry, instructions, manualPieceEntries, confirmedNutrition);
  }

  // Confirming deducts pantry stock. Most of the time that's fully
  // automatic (nearest-expiry order) — the resolve-sources overlay only
  // appears when at least one ingredient genuinely has more than one
  // pantry source to choose from, or (wholePiece only) an outright
  // shortfall with nothing in pantry to cover part or all of what's
  // needed, which is where the overlay's "type a weight instead" fallback
  // comes in. rateFirst carries through to the resolve overlay too (see
  // pendingRateFirst) so piece-size resolution always happens before
  // rating, never after.
  function handleConfirmEntry(entry: MealPlanEntry, rateFirst = false) {
    if (!ready) {
      // Not everything has loaded: hold it until it has (see `queued`).
      onStart?.(entry);
      setQueued({ entry, rateFirst });
      return;
    }
    const conversions = settings?.unitConversions ?? [];
    const requirements = buildIngredientRequirements(
      entry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions,
    );

    if (hasAmbiguity(requirements)) {
      onStart?.(entry);
      setPendingConfirmEntry(entry);
      setPendingRequirements(requirements);
      setAmbiguousRequirements(requirements.filter(requirementNeedsResolution));
      setPendingRateFirst(rateFirst);
      setShowResolveModal(true);
      return;
    }

    const instructions = getDefaultDeductionInstructions(requirements);
    const rows = getExpandedRows(entry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions);
    const confirmedNutrition = computeConfirmNutrition(
      requirements, rows, instructions, [], ingredientMap, pantryItems, conversions,
    );
    finishConfirm(entry, instructions, [], confirmedNutrition, rateFirst);
  }

  async function handleResolvedConfirm(
    selections: Record<string, string[]>,
    manualPieceEntries: ManualPieceInput[],
    amountOverrides: Record<string, AmountOverride>,
  ) {
    if (!pendingConfirmEntry) return;
    setResolvingSaving(true);
    try {
      const conversions = settings?.unitConversions ?? [];
      // Amounts typed in for askAmount lines replace the recipe's nominal
      // ones for both the deduction and the nutrition snapshot.
      const { requirements, rows } = applyAmountOverrides(
        pendingRequirements,
        getExpandedRows(pendingConfirmEntry, recipeMap, ingredientMap, allIngredients, pantryItems, conversions),
        amountOverrides,
        ingredientMap,
        allIngredients,
        conversions,
      );
      // The FULL requirement list (not just the ambiguous subset rendered
      // in the overlay) so requirements that never needed a choice still
      // get auto-drained here — passing only the ambiguous ones would
      // silently skip deducting everything else.
      const instructions = getResolvedDeductionInstructions(requirements, selections);
      const confirmedNutrition = computeConfirmNutrition(
        requirements, rows, instructions, manualPieceEntries, ingredientMap, pantryItems, conversions,
      );
      const entry = pendingConfirmEntry;
      const rateFirst = pendingRateFirst;
      setShowResolveModal(false);
      setPendingConfirmEntry(null);
      setPendingRequirements([]);
      setPendingRateFirst(false);

      // rateFirst carried through from handleConfirmEntry — piece-size
      // resolution just finished, so the rating prompt (skippable) comes
      // next, before the pantry actually gets touched.
      if (rateFirst && wantsAutoRating(entry)) {
        setPendingRatingConfirm({ entry, instructions, manualPieceEntries, confirmedNutrition });
        setRateConfirmEntry(entry);
      } else {
        await performConfirm(entry, instructions, manualPieceEntries, confirmedNutrition);
      }
    } finally {
      setResolvingSaving(false);
    }
  }

  function handleOpenRateAndConfirm(entry: MealPlanEntry) {
    onStart?.(entry);
    setRateConfirmEntry(entry);
  }

  // Shared by both routes into this modal: the "Rate & Confirm" swipe
  // action (rates, then resolves + confirms from scratch — pendingRatingConfirm
  // is null there) and the "add as confirmed" rateFirst path (piece size
  // already resolved before rating ever showed — everything needed to
  // confirm is already stashed, so this just finishes it).
  function finishRating() {
    const entry = rateConfirmEntry;
    const pending = pendingRatingConfirm;
    setRateConfirmEntry(null);
    setPendingRatingConfirm(null);
    if (!entry) return;
    if (pending) {
      void performConfirm(pending.entry, pending.instructions, pending.manualPieceEntries, pending.confirmedNutrition);
    } else {
      handleConfirmEntry(entry);
    }
  }

  async function handleSubmitRateAndConfirm(value: number) {
    const recipeId = rateConfirmEntry?.recipe?._id;
    const ingredientId = rateConfirmEntry?.ingredient?._id;
    if (!recipeId && !ingredientId) return;
    setRatingSaving(true);
    try {
      if (recipeId) await addRecipeScore(recipeId, value);
      else if (ingredientId) await addIngredientScore(ingredientId, value);
      finishRating();
    } catch (err) {
      Alert.alert(
        "Couldn't save rating",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setRatingSaving(false);
    }
  }

  // Confirms without saving a rating — pantry deduction (or the piece-size
  // choice already made) still needs to happen either way; only the score
  // is skipped.
  function handleSkipRating() {
    // Only a skipped *automatic* prompt counts toward backing off.
    if (pendingRatingConfirm) recordRatingPrompt(pendingRatingConfirm.entry, "skip");
    finishRating();
  }

  function handleNeverAskRating() {
    if (pendingRatingConfirm) recordRatingPrompt(pendingRatingConfirm.entry, "disable");
    finishRating();
  }

  // Fire-and-forget: a failure here only means being asked again sooner,
  // never worth blocking the confirm over.
  function recordRatingPrompt(entry: MealPlanEntry, action: RatingPromptAction) {
    const target = entry.recipe
      ? { kind: "recipe" as const, id: entry.recipe._id }
      : entry.ingredient
        ? { kind: "ingredient" as const, id: entry.ingredient._id }
        : null;
    if (target) void updateRatingPrompt(target.kind, target.id, action).catch(() => {});
  }

  const modals = (
    <>
      <RateAndConfirmModal
        visible={!!rateConfirmEntry}
        itemName={rateConfirmEntry?.recipe?.name ?? rateConfirmEntry?.ingredient?.name ?? ""}
        saving={ratingSaving}
        // No "back out" option once this was auto-prompted on top of an
        // already-decided confirm (adding directly as confirmed) — dismissing
        // any way then still confirms, via onSkip, same as the explicit
        // button. The pre-existing swipe-to-rate-and-confirm action (nothing
        // stashed in pendingRatingConfirm) keeps its real Cancel.
        allowCancel={!pendingRatingConfirm}
        onCancel={() => {
          setRateConfirmEntry(null);
          setPendingRatingConfirm(null);
        }}
        onSkip={handleSkipRating}
        onNeverAsk={pendingRatingConfirm ? handleNeverAskRating : undefined}
        onConfirm={(value) => void handleSubmitRateAndConfirm(value)}
      />

      <ResolveIngredientSourcesModal
        visible={showResolveModal}
        requirements={ambiguousRequirements}
        saving={resolvingSaving}
        onCancel={() => {
          setShowResolveModal(false);
          setPendingConfirmEntry(null);
          setPendingRequirements([]);
          setPendingRateFirst(false);
        }}
        onConfirm={(selections, manualPieceEntries, amountOverrides) =>
          void handleResolvedConfirm(selections, manualPieceEntries, amountOverrides)
        }
      />
    </>
  );

  return { confirm: handleConfirmEntry, openRateAndConfirm: handleOpenRateAndConfirm, modals };
}
