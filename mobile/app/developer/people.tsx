import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/src/components/auth/AuthGate";
import { useWideForm } from "@/src/components/forms/wideForm";
import { Button, Card, confirm, copy, errorText, Heading, Input, SmallButton, when } from "@/src/components/settings/AccountParts";
import {
  getAccounts,
  getInviteLinks,
  getInvites,
  makeInvite,
  makeResetCode,
  removeAccount,
  saveInviteLinks,
  setReviewer,
  turnOffAccount,
  turnOnAccount,
  withdrawInvite,
  type Account,
  type AccessCodeInfo,
  type InviteLinks,
} from "@/src/services/authApi";

// Developer → People, the admin's: letting people in and looking after their
// accounts. An invite is a one-time code, sent with a ready-written message
// (through the phone's share sheet — Messages, WhatsApp — or copied): how
// to register their iPhone, where to install the app, and the code. The two
// links are set once, below, and go in every invite. Each person's account
// can be given a reset code (a forgotten password), turned off, or removed,
// and a member can be made a reviewer of the public restaurants (what others
// add and suggest waits for a reviewer; the admin always is one).

function inviteMessage(invite: AccessCodeInfo, links: InviteLinks, from: string) {
  const ways: string[] = [];
  if (links.web) ways.push(`Use it in your browser (phone or computer):\n${links.web}`);
  const iphone: string[] = [];
  if (links.register) iphone.push(`Register your iPhone — open this on it:\n${links.register}\n(I'll let you know when the app's ready for it.)`);
  if (links.install) iphone.push(`Install the app:\n${links.install}`);
  if (iphone.length) ways.push(`${links.web ? "Or as" : "As"} an iPhone app:\n${iphone.map((step, i) => (iphone.length > 1 ? `${i + 1}. ${step}` : step)).join("\n")}`);
  return [
    `${from ? `${from} has invited you` : "You're invited"} to Orbit, a personal assistant for your kitchen, calendar and tasks.`,
    ...ways,
    `To join, tap “Have an invite code? Join” and enter this code:\n${invite.code}${invite.email ? `\nwith this email address: ${invite.email}` : ""}`,
    `The code works once, until ${new Date(invite.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.`,
  ].join("\n\n");
}

async function share(message: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (Platform.OS === "web") {
      const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ text: message });
        return "shared";
      }
      return (await copy(message)) ? "copied" : "failed";
    }
    await Share.share({ message });
    return "shared";
  } catch {
    return "failed";
  }
}

// An invite just made: its message, to send (shown only now).
function InviteReady({ invite, links, from, onDone }: { invite: AccessCodeInfo; links: InviteLinks; from: string; onDone: () => void }) {
  const message = inviteMessage(invite, links, from);
  const [note, setNote] = useState<string | null>(null);
  return (
    <View className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <Text className="text-xs font-semibold text-blue-700">
        Invite ready{invite.note ? ` for ${invite.note}` : ""} — send it now: the code isn&apos;t shown again.
      </Text>
      <Text selectable className="mt-3 rounded-lg bg-white p-3 text-[13px] leading-5 text-slate-700">
        {message}
      </Text>
      {!links.web && !links.install && <Text className="mt-2 text-xs text-amber-700">No web or install link yet: add them under “Invite links” so they go in the message.</Text>}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Button label="Send…" icon="share-outline" onPress={() => void share(message).then((how) => setNote(how === "copied" ? "Copied: paste it into a message." : how === "failed" ? "Couldn't open sharing: copy it instead." : null))} />
        <Button label="Copy message" tone="plain" icon="copy-outline" onPress={() => void copy(message).then((ok) => setNote(ok ? "Copied." : "Couldn't copy."))} />
        <Button label="Copy code" tone="plain" onPress={() => void copy(invite.code ?? "").then((ok) => setNote(ok ? "Code copied." : "Couldn't copy."))} />
        <Button label="Done" tone="plain" onPress={onDone} />
      </View>
      {!!note && <Text className="mt-2 text-xs text-slate-500">{note}</Text>}
    </View>
  );
}

// A reset code just made, for someone who forgot their password.
function ResetReady({ info, person, onDone }: { info: AccessCodeInfo; person: string; onDone: () => void }) {
  const message = `Here's a code to set a new Orbit password: on the sign-in page, tap “Forgot your password? Use a reset code”, and enter it with your email.\n\n${info.code}\n\nIt works once, until ${when(info.expiresAt)}.`;
  const [copied, setCopied] = useState(false);
  return (
    <View className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <Text className="text-xs font-semibold text-blue-700">Reset code for {person} — shown only now</Text>
      <Text selectable className="mt-2 text-2xl font-bold tracking-widest text-slate-900">
        {info.code}
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Button label="Send…" icon="share-outline" onPress={() => void share(message)} />
        <Button label={copied ? "Copied" : "Copy code"} tone="plain" onPress={() => void copy(info.code ?? "").then(setCopied)} />
        <Button label="Done" tone="plain" onPress={onDone} />
      </View>
    </View>
  );
}

export default function PeopleScreen() {
  const { account } = useAccount();
  const router = useRouter();
  const layout = useWideForm();
  const [people, setPeople] = useState<Account[] | null>(null);
  const [invites, setInvites] = useState<AccessCodeInfo[]>([]);
  const [links, setLinks] = useState<InviteLinks>({ web: "", register: "", install: "" });
  const [linkDraft, setLinkDraft] = useState<InviteLinks>({ web: "", register: "", install: "" });
  const [linksState, setLinksState] = useState<{ busy?: boolean; error?: string; saved?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [ready, setReady] = useState<AccessCodeInfo | null>(null);
  const [reset, setReset] = useState<{ info: AccessCodeInfo; person: string; id: string } | null>(null);

  const isAdmin = account?.role === "admin";
  const load = useCallback(() => {
    if (!isAdmin) return;
    getAccounts().then(setPeople, (err) => setError(errorText(err)));
    getInvites().then(setInvites, () => {});
    getInviteLinks().then((saved) => {
      setLinks(saved);
      setLinkDraft(saved);
    }, () => {});
  }, [isAdmin]);
  useFocusEffect(load);

  if (!account) return null;
  if (!isAdmin) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-center text-slate-500">Only the admin looks after people&apos;s accounts.</Text>
      </SafeAreaView>
    );
  }

  async function invite() {
    setInviting(true);
    setError(null);
    try {
      setReady(await makeInvite(inviteEmail.trim(), inviteName.trim()));
      setInviteName("");
      setInviteEmail("");
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setInviting(false);
    }
  }

  async function saveLinks() {
    setLinksState({ busy: true });
    try {
      const saved = await saveInviteLinks({ web: linkDraft.web.trim(), register: linkDraft.register.trim(), install: linkDraft.install.trim() });
      setLinks(saved);
      setLinkDraft(saved);
      setLinksState({ saved: true });
    } catch (err) {
      setLinksState({ error: errorText(err) });
    }
  }

  const act = (job: Promise<unknown>) => void job.then(load, (err) => setError(errorText(err)));
  const linksChanged = linkDraft.web.trim() !== links.web || linkDraft.register.trim() !== links.register || linkDraft.install.trim() !== links.install;
  const firstName = account.name.split(" ")[0] ?? "";
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={layout.page}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => (router.canGoBack() ? router.back() : router.replace("/developer/home"))} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-2xl font-bold text-slate-950">People</Text>
          <Text className="mt-0.5 text-sm text-slate-500">Invites, and everyone&apos;s accounts</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, maxWidth: 820, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        <Text className="text-sm text-slate-500">Each person has their own pantry, planner and lists, and shares your food catalog.</Text>
        {!!error && <Text className="mt-3 text-sm text-red-600">{error}</Text>}

        {/* Invite */}
        <Heading>Invite someone</Heading>
        <Card>
          <View className="px-4 py-3">
            <Input value={inviteName} onChangeText={setInviteName} placeholder="Who it's for, e.g. “Mum” (for your list)" autoCapitalize="words" />
            <Input value={inviteEmail} onChangeText={setInviteEmail} placeholder="Their email (optional: only they can use the code)" keyboardType="email-address" />
            <View className="mt-3">
              <Button label="Create invite" icon="person-add-outline" busy={inviting} onPress={() => void invite()} />
            </View>
            <Text className="mt-2 text-xs text-slate-400">The code works once, for 7 days. You&apos;ll get a message to send them, with the links below.</Text>
            {ready && <InviteReady invite={ready} links={links} from={firstName} onDone={() => setReady(null)} />}
          </View>
          {invites.length > 0 && (
            <View className="border-t border-slate-100 px-4 py-3">
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">Not joined yet</Text>
              {invites.map((inv) => (
                <View key={inv._id} className="mt-2 flex-row items-center">
                  <Ionicons name="mail-unread-outline" size={16} color="#94A3B8" />
                  <Text className="ml-2 flex-1 text-sm text-slate-700">
                    {inv.note || inv.email || "Anyone with the code"}
                    <Text className="text-xs text-slate-400">
                      {inv.note && inv.email ? ` · ${inv.email}` : ""} · until {when(inv.expiresAt)}
                    </Text>
                  </Text>
                  <SmallButton label="Withdraw" danger onPress={() => confirm("Withdraw this invite?", "The code will stop working.", "Withdraw", () => act(withdrawInvite(inv._id)))} />
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* People */}
        <Heading>Accounts</Heading>
        <Card>
          {!people && <ActivityIndicator className="my-4" color="#2563EB" />}
          {people?.map((person, i) => {
            const label = person.name || person.email;
            const off = !!person.disabledAt;
            const me = person._id === account._id;
            return (
              <View key={person._id} className={`px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                <View className="flex-row items-center">
                  <Ionicons name={person.role === "admin" ? "shield-checkmark-outline" : off ? "person-remove-outline" : "person-circle-outline"} size={20} color={off ? "#94A3B8" : "#475569"} />
                  <View className="ml-3 flex-1">
                    <Text className={`text-[15px] font-semibold ${off ? "text-slate-400" : "text-slate-900"}`}>
                      {label}
                      {me ? <Text className="text-xs font-semibold text-slate-400">  · you, admin</Text> : null}
                      {off ? <Text className="text-xs font-semibold text-red-500">  · turned off</Text> : null}
                    </Text>
                    <Text className="text-xs text-slate-400">
                      {person.email} · joined {when(person.createdAt)} · last signed in {when(person.lastSignInAt)}
                    </Text>
                  </View>
                </View>
                {!me && (
                  <View className="ml-8 mt-2 flex-row flex-wrap gap-2">
                    <SmallButton
                      label="Reset code"
                      onPress={() =>
                        confirm(`A reset code for ${label}?`, "For a forgotten password: they set a new one with it, and are signed out everywhere.", "Make code", () =>
                          void makeResetCode(person._id).then((info) => setReset({ info, person: label, id: person._id }), (err) => setError(errorText(err))),
                        )
                      }
                    />
                    {off ? (
                      <SmallButton label="Turn back on" onPress={() => act(turnOnAccount(person._id))} />
                    ) : (
                      <SmallButton
                        label="Turn off"
                        onPress={() =>
                          confirm(`Turn off ${label}'s account?`, "They're signed out everywhere and can't sign in until you turn it back on. Nothing of theirs is deleted.", "Turn off", () => act(turnOffAccount(person._id)))
                        }
                      />
                    )}
                    <SmallButton
                      label="Remove"
                      danger
                      onPress={() =>
                        confirm(`Remove ${label}'s account?`, "Their account and everything that's theirs — pantry, plans, lists, receipts, photos — is deleted for good. This can't be undone.", "Remove", () =>
                          act(removeAccount(person._id)),
                        )
                      }
                    />
                  </View>
                )}
                {!me && person.role !== "admin" && (
                  <View className="ml-8 mt-2 flex-row items-center">
                    <View className="flex-1">
                      <Text className={`text-sm font-semibold ${off ? "text-slate-400" : "text-slate-700"}`}>Reviews restaurants</Text>
                      <Text className="text-xs text-slate-400">Approves or rejects the restaurants, dishes and changes others send in.</Text>
                    </View>
                    <Switch
                      value={!!person.reviewer}
                      onValueChange={(on) => {
                        // (Shown at once; put back if the server says no.)
                        setPeople((prev) => prev?.map((p) => (p._id === person._id ? { ...p, reviewer: on } : p)) ?? prev);
                        setReviewer(person._id, on).then(load, (err) => {
                          setError(errorText(err));
                          load();
                        });
                      }}
                      accessibilityLabel={`${label} reviews restaurants`}
                    />
                  </View>
                )}
                {reset?.id === person._id && <ResetReady info={reset.info} person={reset.person} onDone={() => setReset(null)} />}
              </View>
            );
          })}
        </Card>

        {/* The links in every invite */}
        <Heading>Invite links</Heading>
        <Card>
          <View className="px-4 py-3">
            <Text className="text-sm text-slate-500">Put in every invite message. Until the app is on the App Store, an iPhone has to be registered before a build is made for it to install — the web app needs nothing.</Text>
            <Text className="mt-4 text-xs font-semibold text-slate-500">Use it in a browser</Text>
            <Input value={linkDraft.web} onChangeText={(web) => setLinkDraft((d) => ({ ...d, web }))} placeholder="https://bentobuilder.pages.dev" keyboardType="url" />
            <Text className="mt-1 text-xs text-slate-400">The hosted web app&apos;s address.</Text>
            <Text className="mt-4 text-xs font-semibold text-slate-500">Register their iPhone</Text>
            <Input
              value={linkDraft.register}
              onChangeText={(register) => setLinkDraft((d) => ({ ...d, register }))}
              placeholder="https://expo.dev/register-device/…"
              keyboardType="url"
            />
            <Text className="mt-1 text-xs text-slate-400">From “npx eas-cli device:create” (choose Website) in the mobile folder.</Text>
            <Text className="mt-4 text-xs font-semibold text-slate-500">Install the app</Text>
            <Input value={linkDraft.install} onChangeText={(install) => setLinkDraft((d) => ({ ...d, install }))} placeholder="https://expo.dev/accounts/…/builds/…" keyboardType="url" />
            <Text className="mt-1 text-xs text-slate-400">The latest build&apos;s page on expo.dev (update it after each new build).</Text>
            {!!linksState?.error && <Text className="mt-2 text-sm text-red-600">{linksState.error}</Text>}
            <View className="mt-3 flex-row items-center gap-3">
              <Button label="Save links" busy={linksState?.busy} onPress={() => void saveLinks()} />
              {linksState?.saved && !linksChanged && <Text className="text-xs text-green-600">Saved</Text>}
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
