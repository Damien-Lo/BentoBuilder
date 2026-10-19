import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// The privacy policy: what BentoBuilder keeps, where, who sees it, what's
// sent elsewhere, and how to have it deleted. Opened from the sign-in page
// and from Settings → Account. Keep it true to what the app does — when
// something changes (a new outside service, email), update it and the date.

export const PRIVACY_UPDATED = "19 October 2026";
const CONTACT = "damienlo1234@gmail.com";

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Who we are",
    body: [
      `BentoBuilder is a personal meal-planning and kitchen app run by Damien Lo, shared with friends and family by invitation. Questions, or a request about your data: ${CONTACT}.`,
    ],
  },
  {
    title: "What BentoBuilder keeps",
    body: [
      "Your account: your name, your email address, and your password — kept only in a scrambled form (a hash) that can't be turned back into the password.",
      "What you put in: your pantry, grocery list, meal plans and what you've eaten, recipes and ingredients you add, ratings and notes, nutrition goals, weight entries, calendar events, tasks and lists, receipts you scan, and photos you add (recipes, receipts, nutrition labels, meals).",
      "Your devices: a name for each device you sign in on (like “iPhone” or “Chrome on Mac”) and when it was last used, so you can see and sign out your devices.",
    ],
  },
  {
    title: "Where it's kept",
    body: [
      "On BentoBuilder's server (hosted by Render) and in its database (MongoDB Atlas). Connections to the server are encrypted. On your phone, your sign-in is kept in the phone's secure keychain.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "Your own records — your pantry, plans, meals, weight, lists, receipts and photos — are yours: other people with BentoBuilder accounts can't see them.",
      "The food catalog (ingredients, recipes, brands and categories) is shared between everyone; ingredients and recipes you add yourself are only yours. Your ratings, notes and kitchen settings for shared items are only yours.",
      "As the person who runs BentoBuilder, Damien can technically reach the database to keep it running and fix problems. He won't look at your records except to help you or keep the app working.",
    ],
  },
  {
    title: "What's sent to other services",
    body: [
      "Photos you ask BentoBuilder to read — a receipt, a nutrition label, a meal — are sent to Google's Gemini AI service to read them. Only the photo (and, for a receipt, the list of ingredient names it may match) is sent, not your account.",
      "Barcodes you scan are looked up in Open Food Facts, a public product database. Only the barcode number is sent.",
      "BentoBuilder has no advertising and no tracking or analytics, and your information is never sold or shared for marketing.",
    ],
  },
  {
    title: "Deleting your account",
    body: [
      "You can delete your account at any time in Settings → Account → Delete my account. Your account and everything that's yours — your records, photos and devices — is deleted straight away and can't be recovered. Backups of the database may hold a copy for a short while until they're replaced.",
      `You can also ask for your data, or for it to be deleted, by emailing ${CONTACT}.`,
    ],
  },
  {
    title: "Changes",
    body: ["If this policy changes, the new version will be here, with the date it changed."],
  },
];

export function PrivacyPolicyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white" edges={["top", "left", "right"]}>
        <View className="flex-row items-center border-b border-slate-200 px-4 py-3">
          <Text className="flex-1 text-lg font-bold text-slate-950">Privacy policy</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#475569" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, maxWidth: 720, width: "100%", alignSelf: "center" }}>
          <Text className="text-xs text-slate-400">Last updated {PRIVACY_UPDATED}</Text>
          {SECTIONS.map((section) => (
            <View key={section.title} className="mt-6">
              <Text className="text-base font-bold text-slate-900">{section.title}</Text>
              {section.body.map((paragraph, i) => (
                <Text key={i} selectable className="mt-2 text-[15px] leading-6 text-slate-600">
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
