// UPC-A (12 digits) and EAN-13 (13 digits) encode the same product number —
// EAN-13 is UPC-A with a leading "0" prepended. Depending on how the camera
// decodes a given scan, the same physical barcode can come back as either,
// so comparisons strip leading zeros before matching.
export function normalizeBarcode(barcode: string | null | undefined): string {
  if (!barcode) return "";
  const digitsOnly = barcode.trim().replace(/\D/g, "");
  const stripped = digitsOnly.replace(/^0+/, "");
  return stripped || digitsOnly;
}

export function barcodesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normalizedA = normalizeBarcode(a);
  const normalizedB = normalizeBarcode(b);
  return normalizedA.length > 0 && normalizedA === normalizedB;
}
