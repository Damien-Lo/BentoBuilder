import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/src/components/auth/AuthGate";
import { PrivacyPolicyModal } from "@/src/components/legal/PrivacyPolicy";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { Button, Card, confirm, DESKTOP_PAGE, errorText, Heading, Input, PageHeader, SmallButton, useGoBack, when } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { useWideWeb } from "@/src/utils/useWideWeb";
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
// People.) In Orbit's look, light or dark (`o`: its colours) — in a desktop
// browser beside the Settings list (settings/web/WebSettingsFrame), without
// the way back. (How it looks — Appearance — has
// its own page now, from the Settings list.)

export default function AccountSettingsScreen() {
  const { account, setAccount, signOut } = useAccount();
  const router = useRouter();
  const back = useGoBack("/settings-section");
  const wide = useWideWeb();
  const { colors } = useOrbitTheme();
  const o = colors;
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // You
  const [name, setName] = useState(account?.name ?? "");
  const [changingName, setChangingName] = useState(false);
  const [nameState, setNameState] = useState<{ busy?: boolean; error?: string } | null>(null);
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

  // Your name, as others in your Orbit and its messages show it.
  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return setNameState({ error: "Put in your name." });
    if (trimmed === account!.name) return setChangingName(false);
    setNameState({ busy: true });
    try {
      setAccount(await updateMe({ name: trimmed }));
      setChangingName(false);
      setNameState(null);
    } catch (err) {
      setNameState({ error: errorText(err) });
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
  const signedInAs = `Signed in as ${account.email}${isAdmin ? " · admin" : ""}`;
  const errorStyle = { color: o.danger };
  const line = { borderTopColor: o.border };
  // A "Change" link, in the page's colours.
  const change = (onPress: () => void) => (
    <Tap onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change" pressedStyle={{ opacity: 0.5 }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: o.accent }}>Change</Text>
    </Tap>
  );
  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
      <ScrollView contentContainerStyle={wide ? DESKTOP_PAGE : { padding: 20, paddingBottom: 60, maxWidth: 820, width: "100%", alignSelf: "center", paddingHorizontal: 16, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
        <PageHeader title="Account" subtitle={signedInAs} onBack={wide ? undefined : back} />
        {!!error && <Text className="mt-3 text-sm text-red-600" style={errorStyle}>{error}</Text>}

        {/* You */}
        <Heading>You</Heading>
        <Card>
          <View className="px-4 py-3">
            <View className="flex-row items-center">
              <Ionicons name="person-outline" size={18} color={o.icon} />
              <Text className="ml-3 flex-1 text-base text-slate-900" style={{ color: account.name ? o.text : o.faint }}>{account.name || "No name yet"}</Text>
              {!changingName && change(() => setChangingName(true))}
            </View>
            {changingName && (
              <View className="mt-2">
                <Input value={name} onChangeText={setName} placeholder="Your name" textContentType="name" autoComplete="name" autoCapitalize="words" autoCorrect={false} onSubmitEditing={() => void saveName()} />
                {!!nameState?.error && <Text className="mt-2 text-sm text-red-600" style={errorStyle}>{nameState.error}</Text>}
                <View className="mt-3 flex-row gap-2">
                  <Button label="Save name" fill busy={nameState?.busy} onPress={() => void saveName()} />
                  <Button
                    label="Cancel"
                    tone="plain"
                    fill
                    onPress={() => {
                      setChangingName(false);
                      setName(account.name);
                      setNameState(null);
                    }}
                  />
                </View>
              </View>
            )}
          </View>
          <View className="border-t border-slate-100 px-4 py-3" style={line}>
            <View className="flex-row items-center">
              <Ionicons name="mail-outline" size={18} color={o.icon} />
              <Text className="ml-3 flex-1 text-base text-slate-900" style={{ color: o.text }}>{account.email}</Text>
              {!changingEmail && change(() => setChangingEmail(true))}
            </View>
            {changingEmail && (
              <View className="mt-2">
                <Input value={email} onChangeText={setEmail} placeholder="New email" keyboardType="email-address" textContentType="username" autoComplete="email" />
                <Input value={emailPassword} onChangeText={setEmailPassword} placeholder="Your current password" secureTextEntry textContentType="password" autoComplete="current-password" />
                {!!emailState?.error && <Text className="mt-2 text-sm text-red-600" style={errorStyle}>{emailState.error}</Text>}
                <View className="mt-3 flex-row gap-2">
                  <Button label="Save email" fill busy={emailState?.busy} onPress={() => void saveEmail()} />
                  <Button
                    label="Cancel"
                    tone="plain"
                    fill
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

        {/* Password */}
        <Heading>Password</Heading>
        <Card>
          <View className="px-4 py-3">
            {changingPassword ? (
              <>
                <Input value={current} onChangeText={setCurrent} placeholder="Current password" secureTextEntry textContentType="password" autoComplete="current-password" />
                <Input value={next} onChangeText={setNext} placeholder="New password (at least 8 characters)" secureTextEntry textContentType="newPassword" autoComplete="new-password" />
                <Input value={again} onChangeText={setAgain} placeholder="New password again" secureTextEntry textContentType="newPassword" autoComplete="new-password" />
                {!!passwordState?.error && <Text className="mt-2 text-sm text-red-600" style={errorStyle}>{passwordState.error}</Text>}
                <Text className="mt-2 text-xs text-slate-400" style={{ color: o.faint }}>A few words together works well; common passwords aren&apos;t allowed. Your other devices will be signed out.</Text>
                <View className="mt-3 flex-row gap-2">
                  <Button label="Change password" fill busy={passwordState?.busy} onPress={() => void savePassword()} />
                  <Button
                    label="Cancel"
                    tone="plain"
                    fill
                    onPress={() => {
                      setChangingPassword(false);
                      setPasswordState(null);
                    }}
                  />
                </View>
              </>
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="key-outline" size={18} color={o.icon} />
                <Text className="ml-3 flex-1 text-sm text-slate-600" style={{ color: o.muted }}>{passwordState?.done ?? "••••••••"}</Text>
                {change(() => setChangingPassword(true))}
              </View>
            )}
          </View>
        </Card>

        {/* Devices */}
        <Heading>Signed in on</Heading>
        <Card>
          {!sessions && <ActivityIndicator className="my-4" color={o.muted} />}
          {sessions?.map((session, i) => (
            <View key={session._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`} style={i ? line : undefined}>
              <Ionicons name={/iPhone|Phone/.test(session.deviceName) ? "phone-portrait-outline" : "desktop-outline"} size={18} color={o.icon} />
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-semibold text-slate-900" style={{ color: o.text }}>
                  {session.deviceName || "A device"}
                  {session.current ? <Text className="text-xs font-semibold text-green-600" style={{ color: o.success }}>  · this device</Text> : null}
                </Text>
                <Text className="text-xs text-slate-400" style={{ color: o.faint }}>
                  Signed in {when(session.createdAt)} · last used {when(session.lastUsedAt)}
                </Text>
              </View>
              {!session.current && (
                <SmallButton
                  label="Sign out"
                  onPress={() => confirm(`Sign out ${session.deviceName || "this device"}?`, "It'll need your password to sign in again.", "Sign out", () => void endSession(session._id).then(load, () => {}))}
                />
              )}
            </View>
          ))}
        </Card>
        <View className="mt-3 flex-row flex-wrap gap-2" style={wide ? { gap: 10 } : { flexDirection: "column", gap: 10 }}>
          {others.length > 0 && (
            <Button
              label="Sign out everywhere else"
              tone="plain"
              fill
              icon="log-out-outline"
              onPress={() => confirm("Sign out your other devices?", `${others.length} other device${others.length === 1 ? "" : "s"} will need your password to sign in again.`, "Sign out", () => void endOtherSessions().then(load, () => {}))}
            />
          )}
          <Button label="Sign out" tone="red" fill icon="log-out-outline" onPress={() => confirm("Sign out?", "You'll need your password to sign in again on this device.", "Sign out", () => void signOut())} />
        </View>

        {isAdmin && (
          <>
            <Heading>People</Heading>
            <Card>
              <Tap onPress={() => router.push("/developer/people")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }} pressedStyle={{ backgroundColor: o.pill }}>
                <Ionicons name="people-outline" size={18} color={o.icon} />
                <Text style={{ marginLeft: 12, flex: 1, fontSize: 15, color: o.text }}>Invite people and look after their accounts</Text>
                <Ionicons name="chevron-forward" size={18} color={o.faint} />
              </Tap>
            </Card>
          </>
        )}

        {/* Deleting the account (not the admin's: they look after everyone's) */}
        {!isAdmin && (
          <>
            <Heading>Delete my account</Heading>
            <Card>
              <View className="px-4 py-3">
                <Text className="text-sm text-slate-500" style={{ color: o.muted, lineHeight: 20 }}>
                  Deletes your account and everything that&apos;s yours — your pantry, plans, meals, lists, weight, receipts and photos — for good. It can&apos;t be undone.
                </Text>
                {deleting ? (
                  <>
                    <Input value={deletePassword} onChangeText={setDeletePassword} placeholder="Your password, to confirm" secureTextEntry textContentType="password" autoComplete="current-password" />
                    {!!deleteState?.error && <Text className="mt-2 text-sm text-red-600" style={errorStyle}>{deleteState.error}</Text>}
                    <View className="mt-3 flex-row gap-2">
                      <Button
                        label="Delete everything"
                        tone="red"
                        fill
                        icon="trash-outline"
                        busy={deleteState?.busy}
                        onPress={() =>
                          confirm("Delete your account?", "Everything that's yours is deleted for good. This can't be undone.", "Delete", () => void deleteAccount())
                        }
                      />
                      <Button
                        label="Cancel"
                        tone="plain"
                        fill
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
          <Text className="text-xs font-semibold text-slate-400" style={{ color: o.faint }}>Privacy policy</Text>
        </Pressable>
        <PrivacyPolicyModal visible={privacy} onClose={() => setPrivacy(false)} />
      </ScrollView>
    </SafeAreaView>
    </OrbitPage>
  );
}
