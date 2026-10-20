import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/api";
import { forgetAnswers, remembered, rememberedFetch, setPreloadFetcher } from "@/src/services/apiCache";

// Signing in (see server/routes/AuthRoutes.js). The server hands this
// device a session token when it signs in; it's kept here — in the phone's
// keychain (SecureStore), or the browser's localStorage — and sent with
// every request to the server (installAuthFetch, below), so no screen has to
// think about it. When the server says the session has ended, everyone
// listening (the AuthProvider) is told, and the app shows the sign-in page.

export interface Account {
  _id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt?: string;
  lastSignInAt?: string | null;
  // Turned off by the admin.
  disabledAt?: string | null;
}
export interface SessionInfo {
  _id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}
export interface AccessCodeInfo {
  _id: string;
  kind: "invite" | "reset";
  email: string;
  note: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  // Only when it's just been made: it's shown once.
  code?: string;
}

const TOKEN_KEY = "bentobuilder.session";
// Kept on this device for whoever is signed in; gone when they sign out.
const PERSONAL_KEYS = ["@bentobuilder/receiptReviewDraft", "kitchen.tasks.done", "@bentobuilder/device"];

// --- The token ------------------------------------------------------------

let token: string | null = null;
let loaded = false;

// The phone's keychain — or, in an app built before it was added, the
// ordinary storage until the next build. (Asked first: in such an app even
// loading the package fails, and in a development build that failure is
// shown as a crash before anything can catch it.)
type Keychain = typeof import("expo-secure-store");
let keychain: Promise<Keychain | null> | null = null;
function getKeychain() {
  if (!requireOptionalNativeModule("ExpoSecureStore")) return Promise.resolve(null);
  keychain ??= import("expo-secure-store")
    .then((mod) => ((mod as Keychain).getItemAsync ? (mod as Keychain) : ((mod as { default?: Keychain }).default ?? null)))
    .then(async (mod) => (mod && (await mod.isAvailableAsync().catch(() => false)) ? mod : null))
    .catch(() => null);
  return keychain;
}

async function stored(action: "get" | "set" | "delete", value?: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (action === "get") return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      if (action === "set") globalThis.localStorage?.setItem(TOKEN_KEY, value!);
      else globalThis.localStorage?.removeItem(TOKEN_KEY);
    } catch {
      // (Storage blocked: signed in for this page only.)
    }
    return null;
  }
  const secure = await getKeychain();
  if (action === "get") return (secure && (await secure.getItemAsync(TOKEN_KEY).catch(() => null))) || AsyncStorage.getItem(TOKEN_KEY);
  if (action === "set") {
    if (secure && (await secure.setItemAsync(TOKEN_KEY, value!).then(() => true, () => false))) await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    else await AsyncStorage.setItem(TOKEN_KEY, value!);
  } else {
    await secure?.deleteItemAsync(TOKEN_KEY).catch(() => {});
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  }
  return null;
}

export async function loadToken(): Promise<string | null> {
  if (!loaded) {
    token = await stored("get");
    loaded = true;
  }
  return token;
}
async function keepToken(next: string) {
  forgetAnswers();
  token = next;
  loaded = true;
  await stored("set", next);
}
async function forgetToken() {
  forgetAnswers();
  token = null;
  loaded = true;
  await stored("delete");
  await AsyncStorage.multiRemove(PERSONAL_KEYS).catch(() => {});
}

// --- Every request to the server carries it -------------------------------

type Listener = (message: string) => void;
const listeners = new Set<Listener>();
// Told when the server no longer accepts this device's session.
export function onSessionEnded(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

let installed = false;
// Wraps fetch once, at start-up: requests to our server get the token, and
// one turned away for want of a session (401) signs this device out. Lists
// and records are shared and kept a short while (services/apiCache.ts); any
// change sent forgets them.
export function installAuthFetch() {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch.bind(globalThis);

  async function send(input: RequestInfo | URL, init: RequestInit | undefined, url: string) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    const sent = token;
    const response = await original(input, { ...init, headers });
    // (Not for signing in itself, where a 401 is a wrong password.)
    if (response.status === 401 && sent && token === sent && !url.includes("/api/auth/sign") && !url.includes("/api/auth/reset")) {
      const body = (await response.clone().json().catch(() => null)) as { message?: string } | null;
      await forgetToken();
      listeners.forEach((listener) => listener(body?.message ?? "Your session has ended. Sign in again."));
    }
    return response;
  }

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_BASE_URL) || !token) return original(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.slice(API_BASE_URL.length);
    if (method === "GET" && remembered(path)) return rememberedFetch(path, () => send(input, init, url));
    if (method === "GET") return send(input, init, url);
    // A change: nothing kept from before it (or from while it was on its way).
    forgetAnswers();
    try {
      return await send(input, init, url);
    } finally {
      forgetAnswers();
    }
  };

  setPreloadFetcher((path, keepFor) => rememberedFetch(path, () => send(`${API_BASE_URL}${path}`, undefined, `${API_BASE_URL}${path}`), keepFor));
}

// --- Calls ---------------------------------------------------------------

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/auth${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const data = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !data?.success) throw new Error(data?.message ?? `Request failed (${response.status})`);
  return data.data as T;
}
const send = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

// What this device is called in the list of signed-in devices.
export function thisDeviceName(): string {
  if (Platform.OS !== "web") return Platform.OS === "ios" ? "iPhone" : "Phone";
  const agent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : /Firefox\//.test(agent) ? "Firefox" : "Browser";
  const os = /Mac OS X/.test(agent) ? "Mac" : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : "Computer";
  return `${browser} on ${os}`;
}

async function started(result: { token: string; user: Account }): Promise<Account> {
  await keepToken(result.token);
  return result.user;
}

export const signIn = async (email: string, password: string) => started(await call("/signin", send({ email, password, deviceName: thisDeviceName() })));
export const joinWithInvite = async (code: string, name: string, email: string, password: string) =>
  started(await call("/signup", send({ code, name, email, password, deviceName: thisDeviceName() })));
export const resetPassword = async (code: string, email: string, password: string) => started(await call("/reset", send({ code, email, password, deviceName: thisDeviceName() })));

export async function signOut() {
  await call("/signout", { method: "POST" }).catch(() => {});
  await forgetToken();
}

export const getMe = () => call<{ user: Account; session: SessionInfo }>("/me");
export const updateMe = (changes: { name?: string; email?: string; currentPassword?: string }) => call<Account>("/me", { method: "PATCH", body: JSON.stringify(changes) });
export const changePassword = (currentPassword: string, newPassword: string) => call<{ signedOut: number }>("/password", send({ currentPassword, newPassword }));
export const getSessions = () => call<SessionInfo[]>("/sessions");
export const endSession = (id: string) => call<void>(`/sessions/${id}`, { method: "DELETE" });
export const endOtherSessions = () => call<{ signedOut: number }>("/sessions", { method: "DELETE" });
// Deletes this account and everything that's theirs; signs this device out.
export async function deleteMyAccount(password: string) {
  await call<{ removed: Record<string, number> }>("/me", { method: "DELETE", body: JSON.stringify({ password }) });
  await forgetToken();
}

// The admin's
export const getAccounts = () => call<Account[]>("/users");
export const makeInvite = (email = "", note = "") => call<AccessCodeInfo>("/invites", send({ email, note }));
export const getInvites = () => call<AccessCodeInfo[]>("/invites");
export const withdrawInvite = (id: string) => call<void>(`/invites/${id}`, { method: "DELETE" });
export const makeResetCode = (userId: string) => call<AccessCodeInfo>(`/users/${userId}/reset-code`, { method: "POST" });
// The links put in every invite message (see app/settings-section/people.tsx).
export interface InviteLinks {
  web: string;
  register: string;
  install: string;
}
export const getInviteLinks = () => call<InviteLinks>("/invite-links");
export const saveInviteLinks = (links: InviteLinks) => call<InviteLinks>("/invite-links", { method: "PUT", body: JSON.stringify(links) });
export const turnOffAccount = (userId: string) => call<Account>(`/users/${userId}/disable`, { method: "POST" });
export const turnOnAccount = (userId: string) => call<Account>(`/users/${userId}/enable`, { method: "POST" });
export const removeAccount = (userId: string) => call<{ removed: Record<string, number> }>(`/users/${userId}`, { method: "DELETE" });
