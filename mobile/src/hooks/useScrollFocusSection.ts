import { useCallback, useRef, type RefObject } from "react";
import type { ScrollView, View, ViewStyle } from "react-native";

import { useScrollToFocusedField } from "@/src/hooks/useScrollToFocusedField";

// One "section" is a field (or a small group of related fields, e.g. a
// quantity/unit/price row) inside a form's ScrollView that should scroll
// itself into view on focus/open, and — if it can show a dropdown's option
// list — needs to paint above whatever comes after it in the same scroll
// (plain RN/Yoga stacking paints *later* ScrollView siblings over *earlier*
// ones by default, which is backwards for an open dropdown: its own zIndex
// only wins against its own immediate siblings, e.g. two dropdowns side by
// side, not against a later, unrelated section).
//
// `scrollRef`/`anchorRef` are the same pair useScrollToFocusedField takes —
// `anchorRef` a plain, empty View the caller renders as the very first
// child inside the ScrollView's content (see that hook for why a View,
// collapsable={false}, rather than the ScrollView itself, is what actually
// has to be there).
//
// `zIndex` should descend in the same order the sections appear on screen —
// give the first section on the page the highest number, the last one 0 (or
// just omit it there). Sections that never show a dropdown (a plain
// TextInput) don't strictly need one of their own, but should still get
// *some* number lower than everything before them, or they can end up
// painting over an earlier section's open dropdown by default-stacking
// instead of the other way around.
//
// Usage:
//   const category = useScrollFocusSection(scrollRef, anchorRef, 60);
//   <View {...category.wrapperProps}>
//     <SearchableObjectDropdown onOpen={category.trigger} .../>
//   </View>
// or, for a plain TextInput:
//   <View {...category.wrapperProps}>
//     <TextInput onFocus={category.trigger} .../>
//   </View>
export function useScrollFocusSection(
  scrollRef: RefObject<ScrollView | null>,
  anchorRef: RefObject<View | null>,
  zIndex = 0,
) {
  const nodeRef = useRef<View | null>(null);
  const scrollToField = useScrollToFocusedField(scrollRef, anchorRef);

  const setRef = useCallback((el: View | null) => {
    nodeRef.current = el;
  }, []);

  const trigger = useCallback(() => {
    scrollToField(nodeRef.current);
  }, [scrollToField]);

  return {
    wrapperProps: {
      collapsable: false as const,
      style: { zIndex } as ViewStyle,
      ref: setRef,
    },
    trigger,
  };
}
