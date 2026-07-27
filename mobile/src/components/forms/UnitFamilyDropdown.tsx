import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, Text, View } from "react-native";

interface UnitFamilyDropdownProps {
  unit: string;
  options: string[];
  onSelect: (unit: string) => void;
  disabled?: boolean;
}

interface DropdownPosition {
  top: number;
  right: number;
}

// A small, select-only dropdown for picking among a fixed set of related
// units (e.g. everything in a mass/volume family). Unlike
// CreatableStringDropdown, free text isn't allowed here — the whole point is
// that every choice stays convertible back to the ingredient's own unit.
//
// The popup renders in a Modal (like CreatableStringDropdown) rather than as
// an absolutely-positioned inline sibling — inline positioning gets painted
// over by whatever renders after it in the same scroll view (e.g. an
// ingredient list below the picker card), since z-index in React Native only
// resolves stacking within the same parent, not across the whole screen.
export function UnitFamilyDropdown({
  unit,
  options,
  onSelect,
  disabled = false,
}: UnitFamilyDropdownProps) {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, right: 0 });

  function openDropdown() {
    if (disabled) return;
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const windowWidth = Dimensions.get("window").width;
      setPosition({
        top: y + height + 8,
        right: windowWidth - (x + width),
      });
      setOpen(true);
    });
  }

  function closeDropdown() {
    setOpen(false);
  }

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        disabled={disabled}
        className={`h-12 flex-row items-center rounded-2xl border bg-white px-3 ${
          disabled ? "border-slate-100 opacity-60" : open ? "border-blue-500" : "border-slate-200"
        }`}
        onPress={openDropdown}
      >
        <Text className="mr-1 text-sm text-slate-800">{unit}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#64748B" />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={closeDropdown}>
        <View className="flex-1">
          <Pressable className="absolute inset-0" onPress={closeDropdown} />

          <View
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            style={{
              position: "absolute",
              top: position.top,
              right: position.right,
              maxHeight: 260,
              minWidth: 100,
              zIndex: 1001,
              elevation: 20,
            }}
          >
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {options.map((option) => (
                <Pressable
                  key={option}
                  className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3"
                  onPress={() => {
                    onSelect(option);
                    closeDropdown();
                  }}
                >
                  <Text className="text-base text-slate-800">{option}</Text>
                  {option === unit && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default UnitFamilyDropdown;
