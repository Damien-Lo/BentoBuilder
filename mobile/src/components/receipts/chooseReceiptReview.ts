import { Alert } from "react-native";

import { showActions } from "@/src/components/todo/theme";
import { createReceiptDraft } from "@/src/services/receiptApi";

// Once a receipt's been photographed on the phone: review it now, here (as
// before), or save it to review on the desktop — where each line has room
// to be checked (see the desktop's Receipts page). Saving is quick: the
// receipt is read on the server afterwards. `busy` shows the phone's
// "working" overlay while it's sent.
export function chooseReceiptReview(photoUri: string, { reviewNow, busy }: { reviewNow: () => void; busy: (on: boolean) => void }) {
  // (After the camera has closed: iOS can't show the sheet over it.)
  setTimeout(() => {
    showActions("Where do you want to review this receipt?", [
      { label: "Review now", onPress: reviewNow },
      {
        label: "Review on desktop",
        onPress: () => {
          busy(true);
          createReceiptDraft(photoUri)
            .then(() => Alert.alert("Saved for the desktop", "It's being read now. Open Receipts in the Kitchen on your computer to review it."))
            .catch((error) => Alert.alert("Couldn't save the receipt", error instanceof Error ? error.message : "Something went wrong."))
            .finally(() => busy(false));
        },
      },
    ]);
  }, 400);
}
