import { useEffect, useRef, type ComponentProps } from "react";
import { Platform, View } from "react-native";

// Dragging something from one part of a desktop page onto another (a menu
// item onto a meal on the week), with the browser's own drag and drop.
// Elsewhere these are plain Views.

// What's being dragged, while it is (one drag at a time).
let carried: unknown = null;

// The browser's element under a View (react-native-web).
const domOf = (view: View | null) => (Platform.OS === "web" ? (view as unknown as HTMLElement | null) : null);

export function DragSource({ payload, onStart, onEnd, ...props }: ComponentProps<typeof View> & { payload: unknown; onStart?: () => void; onEnd?: () => void }) {
  const ref = useRef<View>(null);
  const latest = useRef({ payload, onStart, onEnd });
  latest.current = { payload, onStart, onEnd };
  useEffect(() => {
    const node = domOf(ref.current);
    if (!node?.addEventListener) return;
    const start = (e: DragEvent) => {
      carried = latest.current.payload;
      // (Firefox starts no drag without some data.)
      e.dataTransfer?.setData("text/plain", "");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      latest.current.onStart?.();
    };
    const end = () => {
      carried = null;
      latest.current.onEnd?.();
    };
    node.addEventListener("dragstart", start);
    node.addEventListener("dragend", end);
    return () => {
      node.removeEventListener("dragstart", start);
      node.removeEventListener("dragend", end);
    };
  }, []);
  // (Nothing to carry, nothing to drag.)
  useEffect(() => {
    domOf(ref.current)?.setAttribute?.("draggable", payload == null ? "false" : "true");
  }, [payload]);
  return <View ref={ref} {...props} />;
}

// Somewhere a DragSource's payload can be dropped; `onHover` says when one
// is held over it.
export function DropTarget({ onDrop, onHover, ...props }: ComponentProps<typeof View> & { onDrop: (payload: unknown) => void; onHover?: (over: boolean) => void }) {
  const ref = useRef<View>(null);
  const latest = useRef({ onDrop, onHover });
  latest.current = { onDrop, onHover };
  useEffect(() => {
    const node = domOf(ref.current);
    if (!node?.addEventListener) return;
    let over = false;
    const hover = (next: boolean) => {
      if (next === over) return;
      over = next;
      latest.current.onHover?.(next);
    };
    const enter = (e: DragEvent) => {
      if (carried == null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      hover(true);
    };
    const leave = (e: DragEvent) => {
      if (!node.contains(e.relatedTarget as Node | null)) hover(false);
    };
    const drop = (e: DragEvent) => {
      if (carried == null) return;
      e.preventDefault();
      hover(false);
      latest.current.onDrop(carried);
    };
    node.addEventListener("dragenter", enter);
    node.addEventListener("dragover", enter);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => {
      node.removeEventListener("dragenter", enter);
      node.removeEventListener("dragover", enter);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, []);
  return <View ref={ref} {...props} />;
}
