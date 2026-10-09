import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { Card, PageTitle, Row, WEB, WebPage } from "./ui";

// Receipts on the desktop — a design, not a working page yet.
//
// Reviewing a scanned receipt is the one job that's cramped on a phone:
// every line needs an ingredient match, an amount, a unit, a price, a
// location and an expiry. The plan is to keep the camera on the phone and
// move the review here, where each line can be a full table row.
//
// What it needs that doesn't exist yet: today a scan is parsed and handed
// straight back to the phone that took it, and nothing is kept. For the
// phone to scan and the desktop to review, the parsed receipt has to be
// saved on the server as a draft that either can open.

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "camera-outline", title: "Scan on your phone", text: "Photograph the receipt as now. Instead of opening the review there, choose “Review on desktop” and it's saved as a draft." },
  { icon: "desktop-outline", title: "Review it here", text: "The draft appears on this page. Each line is a row: matched ingredient, amount, unit, price, where it goes and when it expires." },
  { icon: "basket-outline", title: "Add to the pantry", text: "Fix what was misread, skip what isn't food, then add the lot in one go. Lines that fail stay on the page to retry." },
];

const COLUMNS = ["Receipt line", "Ingredient", "Amount", "Unit", "Price", "Location", "Expires", ""];

export function WebReceiptsScreen() {
  return (
    <WebPage>
      <PageTitle title="Receipts" subtitle="Planned: scan on the phone, review on the big screen" />

      <Row>
        {STEPS.map((step, index) => (
          <Card key={step.title} style={{ flex: 1, minWidth: 260 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: WEB.blueSoft }}>
                <Ionicons name={step.icon} size={18} color={WEB.blue} />
              </View>
              <Text style={{ marginLeft: 10, fontSize: 12, fontWeight: "700", color: WEB.faint }}>STEP {index + 1}</Text>
            </View>
            <Text style={{ marginTop: 12, fontSize: 15, fontWeight: "700", color: WEB.text }}>{step.title}</Text>
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: WEB.muted }}>{step.text}</Text>
          </Card>
        ))}
      </Row>

      {/* How the review would be laid out */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <View style={{ width: 280, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#CBD5E1", backgroundColor: "#FBFCFE", padding: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: WEB.faint }}>DRAFTS</Text>
          {["Whole Foods · today", "Trader Joe's · Sunday", "H Mart · last week"].map((label, i) => (
            <View key={label} style={{ marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: i === 0 ? "#93C5FD" : WEB.border, backgroundColor: i === 0 ? WEB.blueSoft : "#FFFFFF" }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: WEB.body }}>{label}</Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: WEB.faint }}>{[14, 9, 22][i]} lines · {[3, 0, 5][i]} to check</Text>
            </View>
          ))}
          <Text style={{ marginTop: 12, fontSize: 11, lineHeight: 16, color: WEB.faint }}>Example only — scans waiting to be reviewed would list here.</Text>
        </View>

        <View style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#CBD5E1", backgroundColor: "#FBFCFE", overflow: "hidden" }}>
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: WEB.border, backgroundColor: "#F8FAFC" }}>
            {COLUMNS.map((column, i) => (
              <View key={i} style={{ flex: i === 0 || i === 1 ? 2 : 1, height: 38, justifyContent: "center", paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: WEB.muted }}>{column.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          {Array.from({ length: 6 }, (_, row) => (
            <View key={row} style={{ flexDirection: "row", alignItems: "center", height: 46, borderBottomWidth: 1, borderBottomColor: WEB.line }}>
              {COLUMNS.map((_, i) => (
                <View key={i} style={{ flex: i === 0 || i === 1 ? 2 : 1, paddingHorizontal: 12 }}>
                  <View style={{ height: 10, borderRadius: 5, backgroundColor: "#E2E8F0", width: `${[78, 64, 40, 34, 46, 58, 52, 30][i] - (row % 3) * 6}%` }} />
                </View>
              ))}
            </View>
          ))}
          <View style={{ padding: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: WEB.body }}>The review table</Text>
            <Text style={{ marginTop: 3, maxWidth: 520, textAlign: "center", fontSize: 12, lineHeight: 17, color: WEB.muted }}>
              One row per receipt line, editable in place, with the receipt photo alongside to check against. Scanning and reviewing on the
              phone stays exactly as it is.
            </Text>
          </View>
        </View>
      </View>
    </WebPage>
  );
}
