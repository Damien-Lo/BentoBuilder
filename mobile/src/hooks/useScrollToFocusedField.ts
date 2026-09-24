import { useCallback, type RefObject } from "react";
import type { ScrollView, View } from "react-native";

// How far below the top of the ScrollView's own visible area a
// focused/opened field lands, in on-screen px — this *is* the field's final
// on-screen distance from the top of the viewport post-scroll (scrollTo's y
// is content-space, and the field sits at exactly fieldY - (fieldY -
// TOP_OFFSET) = TOP_OFFSET from the top once scrolled). So a *smaller*
// number lands the field *higher* on screen (closer to the top/pinned
// header), not lower — kept just above 0 rather than exactly 0 so the field
// isn't flush against the very edge.
const TOP_OFFSET = 6;

// Scrolls a field into view within `scrollRef`'s ScrollView whenever it's
// focused (a plain TextInput) or opened (a dropdown) — most of RN's
// scrollable-container types don't auto-scroll to a focused field on their
// own, especially once nested inside another scrollable/pager the way the
// receipt review card is, so fields below the fold can end up hidden behind
// the keyboard or another overlay with no way to see what's being typed.
//
// Deliberately avoids measureLayout(relativeTo, ...) — on this app's RN
// version it fails outright (not just a bad number) for every field tried,
// on-device, even against a real host View with collapsable={false}, not
// just the ScrollView itself. measureInWindow doesn't take a "relative to"
// ancestor at all, just this view's own absolute on-screen position, so
// there's nothing for that relationship to fail on: measuring `anchorRef` —
// a plain View the caller renders as the very first child inside the
// ScrollView's content — and the focused field this same way and taking the
// difference gives the same scroll-invariant, content-space offset
// measureLayout was meant to.
//
// Returns a function to call from a field's onFocus/onOpen, passing the
// field wrapper's own node (from a ref callback).
export function useScrollToFocusedField(
  scrollRef: RefObject<ScrollView | null>,
  anchorRef: RefObject<View | null>,
) {
  return useCallback(
    (node: View | null) => {
      function attempt(retriesLeft: number) {
        const anchor = anchorRef.current;
        if (!anchor || !node) return;

        anchor.measureInWindow((_anchorX: number, anchorY: number) => {
          node!.measureInWindow((_nodeX: number, nodeY: number) => {
            // Both still at the native default of 0 almost always means
            // layout hasn't actually committed yet, right after a fresh
            // mount — not a real coincidental position match.
            if (anchorY === 0 && nodeY === 0) {
              if (retriesLeft > 0) setTimeout(() => attempt(retriesLeft - 1), 100);
              return;
            }
            const target = Math.max(0, nodeY - anchorY - TOP_OFFSET);
            scrollRef.current?.scrollTo({ y: target, animated: true });
          });
        });
      }

      // A beat after focus, so this measures the field's settled position —
      // not one about to shift again from the same focus/open event (e.g. a
      // dropdown's option list expanding directly below it).
      requestAnimationFrame(() => attempt(4));
    },
    [scrollRef, anchorRef],
  );
}
