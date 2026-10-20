import AsyncStorage from "@react-native-async-storage/async-storage";
import { reloadAppAsync } from "expo";
import { Ionicons } from "@expo/vector-icons";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { preload } from "@/src/services/apiCache";

import { getMe, installAuthFetch, loadToken, onSessionEnded, signOut as endSession, type Account } from "@/src/services/authApi";

import { SignInScreen } from "./SignInScreen";

// The app, once this device is signed in — the sign-in page until then.
// Whoever is signed in is available to any screen (useAccount). They're
// remembered on the device too, so the app still opens without a
// connection; if the server says the session has ended, it's back to the
// sign-in page.
//
// Once signed in (just now, or already), what this device usually needs is
// fetched up front (services/apiCache.ts: preload) behind a short loading
// screen, so screens open already filled in. The app is drawn underneath
// meanwhile — its screens share those requests — and the cover lifts when
// they're in, or after WARM_UP_MS whatever happens. A quick start shows no
// cover at all.

installAuthFetch();

const ACCOUNT_KEY = "bentobuilder.account";
const WARM_UP_MS = 6000;
// (No cover for a start quicker than this: no flash.)
const COVER_AFTER_MS = 300;

interface AuthValue {
  account: Account | null;
  setAccount: (account: Account) => void;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthValue>({ account: null, setAccount: () => {}, signOut: async () => {} });
export const useAccount = () => useContext(AuthContext);

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "signedOut" | "signedIn">("checking");
  const [account, setAccountState] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setAccount = useCallback((next: Account) => {
    setAccountState(next);
    setState("signedIn");
    void AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await loadToken())) return !cancelled && setState("signedOut");
      try {
        const { user } = await getMe();
        if (!cancelled) setAccount(user);
      } catch {
        // (No answer — offline, or the session has ended, which
        // onSessionEnded below handles: as who was here last time.)
        const saved = await AsyncStorage.getItem(ACCOUNT_KEY).catch(() => null);
        if (cancelled) return;
        if (!(await loadToken())) return setState("signedOut");
        if (saved) {
          setAccountState(JSON.parse(saved) as Account);
          setState("signedIn");
        } else {
          setState("signedOut");
        }
      }
    })();
    const stop = onSessionEnded((message) => {
      setNotice(message);
      setState("signedOut");
      setAccountState(null);
      void AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [setAccount]);

  const signOut = useCallback(async () => {
    await endSession();
    await AsyncStorage.removeItem(ACCOUNT_KEY).catch(() => {});
    // (A fresh start, so nothing of the last person's stays in memory.)
    if (Platform.OS === "web") window.location.assign("/");
    else await reloadAppAsync().catch(() => {
      setAccountState(null);
      setState("signedOut");
    });
  }, []);

  // Fetching what's usually needed, up front, once per person signed in.
  const [warming, setWarming] = useState(false);
  const [covered, setCovered] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const accountId = account?._id;
  useEffect(() => {
    if (state !== "signedIn" || !accountId) return;
    let over = false;
    setWarming(true);
    setProgress(null);
    const finish = () => {
      if (over) return;
      over = true;
      setWarming(false);
      setCovered(false);
    };
    const cover = setTimeout(() => !over && setCovered(true), COVER_AFTER_MS);
    const limit = setTimeout(finish, WARM_UP_MS);
    void preload((done, total) => !over && setProgress({ done, total })).finally(finish);
    return () => {
      over = true;
      clearTimeout(cover);
      clearTimeout(limit);
    };
  }, [state, accountId]);

  if (state === "checking") {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (state === "signedOut") {
    return (
      <SignInScreen
        notice={notice}
        onSignedIn={(next) => {
          setNotice(null);
          setAccount(next);
        }}
      />
    );
  }
  return (
    <AuthContext.Provider value={{ account, setAccount, signOut }}>
      <View style={{ flex: 1 }}>
        {children}
        {warming && covered && <WarmUp progress={progress} name={account?.name.split(" ")[0] ?? ""} />}
      </View>
    </AuthContext.Provider>
  );
}

// The cover while the day's things are fetched.
function WarmUp({ progress, name }: { progress: { done: number; total: number } | null; name: string }) {
  const share = progress && progress.total ? progress.done / progress.total : 0;
  return (
    <View className="items-center justify-center bg-slate-50 px-10" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
      <View className="h-16 w-16 items-center justify-center rounded-3xl bg-blue-600">
        <Ionicons name="grid-outline" size={30} color="#FFFFFF" />
      </View>
      <Text className="mt-5 text-2xl font-bold text-slate-900">{name ? `Hi, ${name}` : "Welcome back"}</Text>
      <Text className="mt-2 text-center text-sm text-slate-500">Getting your day ready…</Text>
      <View className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
        <View className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(8, Math.round(share * 100))}%` }} />
      </View>
    </View>
  );
}
