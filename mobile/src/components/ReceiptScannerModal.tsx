import { PhotoCaptureModal } from "./PhotoCaptureModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  onCaptured: (photoUri: string) => void;
}

// Thin wrapper around the generic PhotoCaptureModal — this file used to
// hold the camera chrome directly, now extracted so meal-photo estimation
// (a second, near-identical single-capture use site) doesn't duplicate it.
export function ReceiptScannerModal({ visible, onClose, onCaptured }: Props) {
  return (
    <PhotoCaptureModal
      visible={visible}
      onClose={onClose}
      onCaptured={onCaptured}
      subject="receipt"
      instructions="Fit the itemized list in frame — feel free to leave out the payment/card details section if there is one, it isn't needed."
    />
  );
}

export default ReceiptScannerModal;
