import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrivacyPolicyModal } from "@/src/components/legal/PrivacyPolicy";
import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { joinWithInvite, resetPassword, signIn, type Account } from "@/src/services/authApi";
import { getDatabaseState, switchDatabase, type DatabaseId, type DatabaseState } from "@/src/services/databaseApi";
import { useOrbitTheme } from "@/src/theme/orbit";

// The page shown until this device is signed in — on the phone and on the
// web alike. Three ways in: signing in; joining with an invite code (there's
// no open sign-up — the admin hands out codes); and setting a new password
// with a reset code from the admin.
//
// On a developer's machine, where the server can be on the real data or the
// test data, which one is chosen here too: each has its own accounts, so
// it's chosen before signing in.
//
// In Orbit's look: its orb over a card on the canvas, the button in the
// theme's ink, links in blue.

type Mode = "signin" | "join" | "reset";

const COPY: Record<Mode, { title: string; lead: string; button: string }> = {
  signin: { title: "Sign in", lead: "Welcome back.", button: "Sign in" },
  join: { title: "Join Orbit", lead: "Enter the invite code you were given, and choose a password.", button: "Create my account" },
  reset: { title: "Set a new password", lead: "Enter the reset code you were given, and a new password.", button: "Set password and sign in" },
};

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  const { colors } = useOrbitTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ marginBottom: 6, fontSize: 12, fontWeight: "600", color: colors.muted }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        style={[
          { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        ]}
        {...props}
      />
    </View>
  );
}

export function SignInScreen({ notice, onSignedIn }: { notice?: string | null; onSignedIn: (account: Account) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DatabaseState | null>(null);
  const [switching, setSwitching] = useState(false);

  const [privacy, setPrivacy] = useState(false);

  // (Only in a development build: an app built for release never offers it,
  // whatever a server says.)
  useEffect(() => {
    if (__DEV__) getDatabaseState().then(setData, () => {});
  }, []);

  async function chooseData(id: DatabaseId) {
    if (!data || id === data.current || switching) return;
    setSwitching(true);
    setError(null);
    try {
      setData(await switchDatabase(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't switch.");
    } finally {
      setSwitching(false);
    }
  }

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
  }

  async function submit() {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    if (mode !== "signin" && !code.trim()) return setError(mode === "join" ? "Enter your invite code." : "Enter your reset code.");
    setBusy(true);
    try {
      const account =
        mode === "signin"
          ? await signIn(email.trim(), password)
          : mode === "join"
            ? await joinWithInvite(code.trim(), name.trim(), email.trim(), password)
            : await resetPassword(code.trim(), email.trim(), password);
      onSignedIn(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const { colors, dark } = useOrbitTheme();
  const copy = COPY[mode];
  const newPassword = mode !== "signin";
  const link = { fontWeight: "600" as const, color: colors.accent };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}>
            <View style={{ marginBottom: 24, alignItems: "center" }}>
              {/* Orbit's orb */}
              <OrbSphere size={60} label="Orbit" colors={colors} dark={dark} />
              <Text style={{ marginTop: 12, fontSize: 18, fontWeight: "800", color: colors.text }}>Orbit</Text>
            </View>

            <View style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 24 }}>
              <Text style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.4, color: colors.text }}>{copy.title}</Text>
              <Text style={{ marginTop: 4, fontSize: 14, color: colors.muted }}>{copy.lead}</Text>

              {!!notice && mode === "signin" && (
                <View className="mt-4 flex-row items-center rounded-xl bg-amber-50 px-3 py-2.5">
                  <Ionicons name="information-circle-outline" size={18} color="#B45309" />
                  <Text className="ml-2 flex-1 text-sm text-amber-800">{notice}</Text>
                </View>
              )}

              {mode !== "signin" && (
                <Field
                  label={mode === "join" ? "Invite code" : "Reset code"}
                  value={code}
                  onChangeText={setCode}
                  placeholder="XXXXX-XXXXX"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              )}
              {mode === "join" && <Field label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" textContentType="name" autoComplete="name" />}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="email"
              />
              <Field
                label={newPassword ? "New password (at least 8 characters)" : "Password"}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={newPassword ? "newPassword" : "password"}
                autoComplete={newPassword ? "new-password" : "current-password"}
                onSubmitEditing={() => void submit()}
                returnKeyType="go"
              />

              {!!error && <Text style={{ marginTop: 16, fontSize: 14, color: colors.danger }}>{error}</Text>}

              <Pressable
                onPress={() => void submit()}
                disabled={busy}
                style={({ pressed }) => ({ marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14, backgroundColor: colors.ink, opacity: busy ? 0.6 : pressed ? 0.85 : 1 })}
              >
                {busy && <ActivityIndicator color={colors.onInk} style={{ marginRight: 8 }} />}
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onInk }}>{copy.button}</Text>
              </Pressable>
            </View>

            <View className="mt-5 items-center gap-3">
              {mode === "signin" ? (
                <>
                  <Pressable onPress={() => switchTo("join")} hitSlop={6}>
                    <Text style={{ fontSize: 14, color: colors.muted }}>
                      Have an invite code? <Text style={link}>Join</Text>
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => switchTo("reset")} hitSlop={6}>
                    <Text style={{ fontSize: 14, color: colors.muted }}>
                      Forgot your password? <Text style={link}>Use a reset code</Text>
                    </Text>
                  </Pressable>
                  <Text style={{ paddingHorizontal: 24, textAlign: "center", fontSize: 12, color: colors.faint }}>No reset code? Ask whoever runs your Orbit for one.</Text>
                </>
              ) : (
                <Pressable onPress={() => switchTo("signin")} hitSlop={6}>
                  <Text style={[link, { fontSize: 14 }]}>Back to sign in</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={() => setPrivacy(true)} hitSlop={6} className="mt-6 items-center">
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.faint }}>Privacy policy</Text>
            </Pressable>
            <PrivacyPolicyModal visible={privacy} onClose={() => setPrivacy(false)} />

            {__DEV__ && data?.canSwitch && (
              <View className="mt-8 items-center">
                <View className="flex-row rounded-xl bg-slate-200/70 p-1">
                  {data.databases.map((db) => {
                    const on = db.id === data.current;
                    return (
                      <Pressable
                        key={db.id}
                        onPress={() => void chooseData(db.id)}
                        disabled={switching}
                        className={`rounded-lg px-4 py-1.5 ${on ? (db.id === "test" ? "bg-amber-500" : "bg-red-600") : ""}`}
                      >
                        <Text className={`text-xs font-bold ${on ? "text-white" : "text-slate-500"}`}>{db.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="mt-2 px-6 text-center text-xs text-slate-400">
                  {switching ? "Switching…" : "This machine's server can use either. Each has its own accounts: sign in with one from the data chosen here."}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
