import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/src/components/auth/AuthGate";
import { PrivacyPolicyModal } from "@/src/components/legal/PrivacyPolicy";
import { useOrbitTheme, type Appearance } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { Button, Card, confirm, errorText, Heading, Input, when } from "@/src/components/settings/AccountParts";
import {
  changePassword,
  deleteMyAccount,
  endOtherSessions,
  endSession,
  getSessions,
  updateMe,
  type SessionInfo,
} from "@/src/services/authApi";

// Settings → Account: who's signed in — name, email, password — the devices
// signed in to the account, signing out, and deleting the account. (The
// admin lets people in, and looks after their accounts, in Developer →
// People.)

export default function AccountSettingsScreen() {
  const { account, setAccount, signOut } = useAccount();
  const { appearance, setAppearance } = useOrbitTheme();
  // (The desktop has its own light/dark switch, in the side bar.)
  const wide = useWideWeb();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // You
  const [name, setName] = useState(account?.name ?? "");
  const [changingEmail, setChangingEmail] = useState(false);
  const [email, setEmail] = useState(account?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailState, setEmailState] = useState<{ busy?: boolean; error?: string } | null>(null);

  // Password
  const [changingPassword, setChangingPassword] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [passwordState, setPasswordState] = useState<{ busy?: boolean; error?: string; done?: string } | null>(null);

  const isAdmin = account?.role === "admin";

  // Deleting the account
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteState, setDeleteState] = useState<{ busy?: boolean; error?: string } | null>(null);
  const [privacy, setPrivacy] = useState(false);

  const load = useCallback(() => {
    getSessions().then(setSessions, (err) => setError(errorText(err)));
  }, []);
  useFocusEffect(load);

  if (!account) return null;

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed === account!.name) return;
    try {
      setAccount(await updateMe({ name: trimmed }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveEmail() {
    setEmailState({ busy: true });
    try {
      setAccount(await updateMe({ email: email.trim(), currentPassword: emailPassword }));
      setChangingEmail(false);
      setEmailPassword("");
      setEmailState(null);
    } catch (err) {
      setEmailState({ error: errorText(err) });
    }
  }

  async function savePassword() {
    if (next.length < 8) return setPasswordState({ error: "Use at least 8 characters." });
    if (next !== again) return setPasswordState({ error: "The new passwords don't match." });
    setPasswordState({ busy: true });
    try {
      const { signedOut } = await changePassword(current, next);
      setCurrent("");
      setNext("");
      setAgain("");
      setChangingPassword(false);
      setPasswordState({ done: signedOut ? `Password changed. ${signedOut} other device${signedOut === 1 ? " was" : "s were"} signed out.` : "Password changed." });
      load();
    } catch (err) {
      setPasswordState({ error: errorText(err) });
    }
  }

  async function deleteAccount() {
    setDeleteState({ busy: true });
    try {
      await deleteMyAccount(deletePassword);
      // (Signed out, and a fresh start.)
      await signOut();
    } catch (err) {
      setDeleteState({ error: errorText(err) });
    }
  }

  const others = (sessions ?? []).filter((s) => !s.current);
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, maxWidth: 820, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-slate-950">Account</Text>
        <Text className="mt-1 text-sm text-slate-500">
          Signed in as {account.email}
          {isAdmin ? " · admin" : ""}
        </Text>
        {!!error && <Text className="mt-3 text-sm text-red-600">{error}</Text>}

        {/* You */}
        <Heading>You</Heading>
        <Card>
          <View className="flex-row items-center px-4 py-3">
            <Ionicons name="person-outline" size={18} color="#475569" />
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={() => void saveName()}
              onSubmitEditing={() => void saveName()}
              placeholder="Your name"
              placeholderTextColor="#94A3B8"
              className="ml-3 flex-1 text-base text-slate-900"
              style={Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined}
              accessibilityLabel="Your name"
            />
            <Text className="text-xs text-slate-400">Name</Text>
          </View>
          <View className="border-t border-slate-100 px-4 py-3">
            <View className="flex-row items-center">
              <Ionicons name="mail-outline" size={18} color="#475569" />
              <Text className="ml-3 flex-1 text-base text-slate-900">{account.email}</Text>
              {!changingEmail && (
                <Pressable onPress={() => setChangingEmail(true)} hitSlop={8}>
                  <Text className="text-sm font-semibold text-blue-600">Change</Text>
                </Pressable>
              )}
            </View>
            {changingEmail && (
              <View className="mt-2">
                <Input value={email} onChangeText={setEmail} placeholder="New email" keyboardType="email-address" textContentType="username" autoComplete="email" />
                <Input value={emailPassword} onChangeText={setEmailPassword} placeholder="Your current password" secureTextEntry textContentType="password" autoComplete="current-password" />
                {!!emailState?.error && <Text className="mt-2 text-sm text-red-600">{emailState.error}</Text>}
                <View className="mt-3 flex-row gap-2">
                  <Button label="Save email" busy={emailState?.busy} onPress={() => void saveEmail()} />
                  <Button
                    label="Cancel"
                    tone="plain"
                    onPress={() => {
                      setChangingEmail(false);
                      setEmail(account.email);
                      setEmailState(null);
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        </Card>

        {/* Appearance, on the phone */}
        {!wide && (
          <>
            <Heading>Appearance</Heading>
            <Card>
              <View className="px-4 py-3">
                <View className="flex-row rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      ["system", "Automatic", "phone-portrait-outline"],
                      ["light", "Light", "sunny-outline"],
                      ["dark", "Dark", "moon-outline"],
                    ] as [Appearance, string, keyof typeof Ionicons.glyphMap][]
                  ).map(([value, label, icon]) => {
                    const on = appearance === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setAppearance(value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        className={`flex-1 flex-row items-center justify-center rounded-lg py-2 ${on ? "bg-white" : ""}`}
                      >
                        <Ionicons name={icon} size={15} color={on ? "#0F172A" : "#64748B"} />
                        <Text className={`ml-1.5 text-sm font-semibold ${on ? "text-slate-900" : "text-slate-500"}`}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="mt-2 text-xs text-slate-400">Automatic follows your phone. For now only the home screen changes — the rest of the app is being redesigned to match.</Text>
              </View>
            </Card>
          </>
        )}

        {/* Password */}
        <Heading>Password</Heading>
        <Card>
          <View className="px-4 py-3">
            {changingPassword ? (
              <>
                <Input value={current} onChangeText={setCurrent} placeholder="Current password" secureTextEntry textContentType="password" autoComplete="current-password" />
                <Input value={next} onChangeText={setNext} placeholder="New password (at least 8 characters)" secureTextEntry textContentType="newPassword" autoComplete="new-password" />
                <Input value={again} onChangeText={setAgain} placeholder="New password again" secureTextEntry textContentType="newPassword" autoComplete="new-password" />
                {!!passwordState?.error && <Text className="mt-2 text-sm text-red-600">{passwordState.error}</Text>}
                <Text className="mt-2 text-xs text-slate-400">Your other devices will be signed out.</Text>
                <View className="mt-3 flex-row gap-2">
                  <Button label="Change password" busy={passwordState?.busy} onPress={() => void savePassword()} />
                  <Button
                    label="Cancel"
                    tone="plain"
                    onPress={() => {
                      setChangingPassword(false);
                      setPasswordState(null);
                    }}
                  />
                </View>
              </>
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="key-outline" size={18} color="#475569" />
                <Text className="ml-3 flex-1 text-sm text-slate-600">{passwordState?.done ?? "••••••••"}</Text>
                <Pressable onPress={() => setChangingPassword(true)} hitSlop={8}>
                  <Text className="text-sm font-semibold text-blue-600">Change</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Card>

        {/* Devices */}
        <Heading>Signed in on</Heading>
        <Card>
          {!sessions && <ActivityIndicator className="my-4" color="#2563EB" />}
          {sessions?.map((session, i) => (
            <View key={session._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
              <Ionicons name={/iPhone|Phone/.test(session.deviceName) ? "phone-portrait-outline" : "desktop-outline"} size={18} color="#2563EB" />
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-semibold text-slate-900">
                  {session.deviceName || "A device"}
                  {session.current ? <Text className="text-xs font-semibold text-green-600">  · this device</Text> : null}
                </Text>
                <Text className="text-xs text-slate-400">
                  Signed in {when(session.createdAt)} · last used {when(session.lastUsedAt)}
                </Text>
              </View>
              {!session.current && (
                <Pressable
                  onPress={() => confirm(`Sign out ${session.deviceName || "this device"}?`, "It'll need your password to sign in again.", "Sign out", () => void endSession(session._id).then(load, () => {}))}
                  hitSlop={8}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 active:bg-slate-200"
                >
                  <Text className="text-xs font-semibold text-slate-600">Sign out</Text>
                </Pressable>
              )}
            </View>
          ))}
        </Card>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {others.length > 0 && (
            <Button
              label="Sign out everywhere else"
              tone="plain"
              icon="log-out-outline"
              onPress={() => confirm("Sign out your other devices?", `${others.length} other device${others.length === 1 ? "" : "s"} will need your password to sign in again.`, "Sign out", () => void endOtherSessions().then(load, () => {}))}
            />
          )}
          <Button label="Sign out" tone="red" icon="log-out-outline" onPress={() => confirm("Sign out?", "You'll need your password to sign in again on this device.", "Sign out", () => void signOut())} />
        </View>

        {isAdmin && (
          <>
            <Heading>People</Heading>
            <Card>
              <Pressable onPress={() => router.push("/developer/people")} className="flex-row items-center px-4 py-3.5 active:bg-slate-50">
                <Ionicons name="people-outline" size={18} color="#475569" />
                <Text className="ml-3 flex-1 text-[15px] text-slate-900">Invite people and look after their accounts</Text>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            </Card>
          </>
        )}

        {/* Deleting the account (not the admin's: they look after everyone's) */}
        {!isAdmin && (
          <>
            <Heading>Delete my account</Heading>
            <Card>
              <View className="px-4 py-3">
                <Text className="text-sm text-slate-500">
                  Deletes your account and everything that&apos;s yours — your pantry, plans, meals, lists, weight, receipts and photos — for good. It can&apos;t be undone.
                </Text>
                {deleting ? (
                  <>
                    <Input value={deletePassword} onChangeText={setDeletePassword} placeholder="Your password, to confirm" secureTextEntry textContentType="password" autoComplete="current-password" />
                    {!!deleteState?.error && <Text className="mt-2 text-sm text-red-600">{deleteState.error}</Text>}
                    <View className="mt-3 flex-row gap-2">
                      <Button
                        label="Delete everything"
                        tone="red"
                        icon="trash-outline"
                        busy={deleteState?.busy}
                        onPress={() =>
                          confirm("Delete your account?", "Everything that's yours is deleted for good. This can't be undone.", "Delete", () => void deleteAccount())
                        }
                      />
                      <Button
                        label="Cancel"
                        tone="plain"
                        onPress={() => {
                          setDeleting(false);
                          setDeletePassword("");
                          setDeleteState(null);
                        }}
                      />
                    </View>
                  </>
                ) : (
                  <View className="mt-3">
                    <Button label="Delete my account…" tone="red" icon="trash-outline" onPress={() => setDeleting(true)} />
                  </View>
                )}
              </View>
            </Card>
          </>
        )}

        <Pressable onPress={() => setPrivacy(true)} hitSlop={6} className="mt-8 items-center">
          <Text className="text-xs font-semibold text-slate-400">Privacy policy</Text>
        </Pressable>
        <PrivacyPolicyModal visible={privacy} onClose={() => setPrivacy(false)} />
      </ScrollView>
    </SafeAreaView>
  );
}
