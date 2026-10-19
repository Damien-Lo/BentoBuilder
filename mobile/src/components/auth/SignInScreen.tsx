import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrivacyPolicyModal } from "@/src/components/legal/PrivacyPolicy";
import { joinWithInvite, resetPassword, signIn, type Account } from "@/src/services/authApi";
import { getDatabaseState, switchDatabase, type DatabaseId, type DatabaseState } from "@/src/services/databaseApi";

// The page shown until this device is signed in — on the phone and on the
// web alike. Three ways in: signing in; joining with an invite code (there's
// no open sign-up — the admin hands out codes); and setting a new password
// with a reset code from the admin.
//
// On a developer's machine, where the server can be on the real data or the
// test data, which one is chosen here too: each has its own accounts, so
// it's chosen before signing in.

type Mode = "signin" | "join" | "reset";

const COPY: Record<Mode, { title: string; lead: string; button: string }> = {
  signin: { title: "Sign in", lead: "Welcome back.", button: "Sign in" },
  join: { title: "Join BentoBuilder", lead: "Enter the invite code you were given, and choose a password.", button: "Create my account" },
  reset: { title: "Set a new password", lead: "Enter the reset code you were given, and a new password.", button: "Set password and sign in" },
};

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View className="mt-4">
      <Text className="mb-1.5 text-xs font-semibold text-slate-500">{label}</Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900"
        style={Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined}
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

  const copy = COPY[mode];
  const newPassword = mode !== "signin";
  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}>
            <View className="mb-6 items-center">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
                <Ionicons name="grid" size={26} color="white" />
              </View>
              <Text className="mt-3 text-lg font-bold text-slate-900">BentoBuilder</Text>
            </View>

            <View className="rounded-3xl border border-slate-200 bg-white p-6">
              <Text className="text-2xl font-bold text-slate-950">{copy.title}</Text>
              <Text className="mt-1 text-sm text-slate-500">{copy.lead}</Text>

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

              {!!error && <Text className="mt-4 text-sm text-red-600">{error}</Text>}

              <Pressable onPress={() => void submit()} disabled={busy} className={`mt-6 flex-row items-center justify-center rounded-xl py-3.5 ${busy ? "bg-blue-400" : "bg-blue-600 active:bg-blue-700"}`}>
                {busy && <ActivityIndicator color="white" style={{ marginRight: 8 }} />}
                <Text className="text-base font-semibold text-white">{copy.button}</Text>
              </Pressable>
            </View>

            <View className="mt-5 items-center gap-3">
              {mode === "signin" ? (
                <>
                  <Pressable onPress={() => switchTo("join")} hitSlop={6}>
                    <Text className="text-sm text-slate-500">
                      Have an invite code? <Text className="font-semibold text-blue-600">Join</Text>
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => switchTo("reset")} hitSlop={6}>
                    <Text className="text-sm text-slate-500">
                      Forgot your password? <Text className="font-semibold text-blue-600">Use a reset code</Text>
                    </Text>
                  </Pressable>
                  <Text className="px-6 text-center text-xs text-slate-400">No reset code? Ask whoever runs your BentoBuilder for one.</Text>
                </>
              ) : (
                <Pressable onPress={() => switchTo("signin")} hitSlop={6}>
                  <Text className="text-sm font-semibold text-blue-600">Back to sign in</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={() => setPrivacy(true)} hitSlop={6} className="mt-6 items-center">
              <Text className="text-xs font-semibold text-slate-400">Privacy policy</Text>
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
