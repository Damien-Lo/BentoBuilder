import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/src/components/auth/AuthGate";
import {
  changePassword,
  endOtherSessions,
  endSession,
  getAccounts,
  getInvites,
  getSessions,
  makeInvite,
  makeResetCode,
  updateMe,
  withdrawInvite,
  type Account,
  type AccessCodeInfo,
  type SessionInfo,
} from "@/src/services/authApi";

// Settings → Account: who's signed in — name, email, password — the devices
// signed in to the account, and signing out. The admin also lets people in
// here: invite codes for new accounts, and reset codes for a forgotten
// password (no email is sent; the admin passes the code on).

function confirm(title: string, message: string, action: string, go: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) go();
  } else {
    Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: action, style: "destructive", onPress: go }]);
  }
}

async function copy(text: string) {
  try {
    if (Platform.OS === "web") await navigator.clipboard.writeText(text);
    else await (await import("expo-clipboard")).setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

function Heading({ children }: { children: ReactNode }) {
  return <Text className="mb-2 mt-7 text-xs font-bold uppercase tracking-wide text-slate-400">{children}</Text>;
}
function Card({ children }: { children: ReactNode }) {
  return <View className="rounded-2xl border border-slate-200 bg-white">{children}</View>;
}
function Input(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#94A3B8"
      autoCapitalize="none"
      autoCorrect={false}
      className="mt-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900"
      style={Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : undefined}
      {...props}
    />
  );
}
function Button({ label, onPress, busy, tone = "blue", icon }: { label: string; onPress: () => void; busy?: boolean; tone?: "blue" | "plain" | "red"; icon?: keyof typeof Ionicons.glyphMap }) {
  const look = tone === "blue" ? "bg-blue-600 active:bg-blue-700" : tone === "red" ? "bg-red-50 active:bg-red-100" : "bg-slate-100 active:bg-slate-200";
  const text = tone === "blue" ? "text-white" : tone === "red" ? "text-red-600" : "text-slate-700";
  return (
    <Pressable onPress={onPress} disabled={busy} className={`flex-row items-center self-start rounded-xl px-4 py-2.5 ${look}`}>
      {busy ? (
        <ActivityIndicator size="small" color={tone === "blue" ? "white" : "#64748B"} style={{ marginRight: 6 }} />
      ) : (
        icon && <Ionicons name={icon} size={16} color={tone === "blue" ? "white" : tone === "red" ? "#DC2626" : "#334155"} style={{ marginRight: 6 }} />
      )}
      <Text className={`text-sm font-semibold ${text}`}>{label}</Text>
    </Pressable>
  );
}

// A code just made: shown once, to pass on.
function CodeShown({ info, onDone }: { info: AccessCodeInfo; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <View className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <Text className="text-xs font-semibold text-blue-700">
        {info.kind === "invite" ? "Invite code" : "Reset code"}
        {info.email ? ` for ${info.email}` : ""} — shown only now; valid until {when(info.expiresAt)}
      </Text>
      <Text selectable className="mt-2 text-2xl font-bold tracking-widest text-slate-900" style={{ fontVariant: ["tabular-nums"] }}>
        {info.code}
      </Text>
      <Text className="mt-1 text-xs text-slate-500">
        {info.kind === "invite"
          ? "They open BentoBuilder, choose “Have an invite code? Join”, and enter it."
          : "They choose “Forgot your password? Use a reset code” on the sign-in page, and enter it with their email."}
      </Text>
      <View className="mt-3 flex-row gap-2">
        <Button label={copied ? "Copied" : "Copy"} icon={copied ? "checkmark" : "copy-outline"} tone="plain" onPress={() => void copy(info.code ?? "").then(setCopied)} />
        <Button label="Done" tone="plain" onPress={onDone} />
      </View>
    </View>
  );
}

export default function AccountSettingsScreen() {
  const { account, setAccount, signOut } = useAccount();
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

  // The admin's
  const isAdmin = account?.role === "admin";
  const [people, setPeople] = useState<Account[]>([]);
  const [invites, setInvites] = useState<AccessCodeInfo[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [shown, setShown] = useState<AccessCodeInfo | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const load = useCallback(() => {
    getSessions().then(setSessions, (err) => setError(errorText(err)));
    if (isAdmin) {
      getAccounts().then(setPeople, () => {});
      getInvites().then(setInvites, () => {});
    }
  }, [isAdmin]);
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

  async function invite() {
    setAdminBusy(true);
    try {
      setShown(await makeInvite(inviteEmail.trim(), inviteNote.trim()));
      setInviteEmail("");
      setInviteNote("");
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAdminBusy(false);
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
            {/* People */}
            <Heading>People</Heading>
            <Card>
              {people.map((person, i) => (
                <View key={person._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                  <Ionicons name={person.role === "admin" ? "shield-checkmark-outline" : "person-circle-outline"} size={20} color="#475569" />
                  <View className="ml-3 flex-1">
                    <Text className="text-[15px] font-semibold text-slate-900">
                      {person.name || person.email}
                      {person.role === "admin" ? <Text className="text-xs font-semibold text-slate-400">  · admin</Text> : null}
                    </Text>
                    <Text className="text-xs text-slate-400">
                      {person.email} · last signed in {when(person.lastSignInAt)}
                    </Text>
                  </View>
                  {person._id !== account._id && (
                    <Pressable
                      onPress={() =>
                        confirm(`A reset code for ${person.name || person.email}?`, "For a forgotten password: they set a new one with it, and are signed out everywhere.", "Make code", () =>
                          void makeResetCode(person._id).then(setShown, (err) => setError(errorText(err))),
                        )
                      }
                      hitSlop={8}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 active:bg-slate-200"
                    >
                      <Text className="text-xs font-semibold text-slate-600">Reset code</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>

            {/* Invites */}
            <Heading>Invite someone</Heading>
            <Card>
              <View className="px-4 py-3">
                <Text className="text-sm text-slate-500">They get their own pantry, planner and lists, and share your food catalog. An invite code works once, for 7 days.</Text>
                <Input value={inviteEmail} onChangeText={setInviteEmail} placeholder="Their email (optional: only they can use the code)" keyboardType="email-address" />
                <Input value={inviteNote} onChangeText={setInviteNote} placeholder="Note for yourself (optional), e.g. “Mum”" autoCapitalize="sentences" />
                <View className="mt-3">
                  <Button label="Make invite code" icon="person-add-outline" busy={adminBusy} onPress={() => void invite()} />
                </View>
                {shown && <CodeShown info={shown} onDone={() => setShown(null)} />}
              </View>
              {invites.length > 0 && (
                <View className="border-t border-slate-100 px-4 py-3">
                  <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">Waiting to be used</Text>
                  {invites.map((inv) => (
                    <View key={inv._id} className="mt-2 flex-row items-center">
                      <Text className="flex-1 text-sm text-slate-700">
                        {inv.note || inv.email || "Anyone with the code"}
                        <Text className="text-xs text-slate-400">
                          {inv.note && inv.email ? ` · ${inv.email}` : ""} · until {when(inv.expiresAt)}
                        </Text>
                      </Text>
                      <Pressable onPress={() => confirm("Withdraw this invite?", "The code will stop working.", "Withdraw", () => void withdrawInvite(inv._id).then(load, () => {}))} hitSlop={8}>
                        <Text className="text-xs font-semibold text-red-600">Withdraw</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
