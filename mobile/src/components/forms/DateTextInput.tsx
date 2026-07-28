import { TextInput, type TextInputProps } from "react-native";

interface DateTextInputProps
  extends Omit<TextInputProps, "value" | "onChangeText" | "keyboardType" | "maxLength"> {
  value: string;
  onChangeText: (value: string) => void;
}

function formatDigitsAsDate(digits: string): string {
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return [year, month, day].filter(Boolean).join("-");
}

// A YYYY-MM-DD field that only accepts digits from a numeric keypad —
// dashes are inserted automatically as the year/month/day segments fill up
// (and removed along with the digit before them on backspace), so there's
// no need for a keyboard with a dash key ("numeric" doesn't reliably have
// one on iOS).
export function DateTextInput({
  value,
  onChangeText,
  placeholder = "YYYY-MM-DD",
  placeholderTextColor = "#94A3B8",
  ...props
}: DateTextInputProps) {
  function handleChangeText(newText: string) {
    const prevDigits = value.replace(/\D/g, "");
    const newDigits = newText.replace(/\D/g, "").slice(0, 8);

    // Backspacing over an auto-inserted dash would otherwise look like a
    // no-op (same digits go back in, dash gets re-inserted) — so when the
    // visible text got shorter but the digit count didn't change, drop one
    // more digit too.
    const digits =
      newText.length < value.length && newDigits.length === prevDigits.length
        ? newDigits.slice(0, -1)
        : newDigits;

    onChangeText(formatDigitsAsDate(digits));
  }

  return (
    <TextInput
      {...props}
      value={value}
      onChangeText={handleChangeText}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      keyboardType="number-pad"
      maxLength={10}
    />
  );
}

export default DateTextInput;
