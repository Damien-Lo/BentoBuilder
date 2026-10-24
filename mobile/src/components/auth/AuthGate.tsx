import AsyncStorage from "@react-native-async-storage/async-storage";
import { reloadAppAsync } from "expo";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

import { preload } from "@/src/services/apiCache";

import { getMe, installAuthFetch, loadToken, onSessionEnded, signOut as endSession, type Account } from "@/src/services/authApi";

import { useOrbitTheme } from "@/src/theme/orbit";

import { LoadingOrbit, type OrbStart } from "./LoadingOrbit";
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
// cover at all — except just after signing in, when the sign-in page's orb
// comes down into it (LoadingOrbit) and it stays at least SIGNED_IN_MS, so
// that's seen whole.

installAuthFetch();

const ACCOUNT_KEY = "bentobuilder.account";
const WARM_UP_MS = 6000;
// (No cover for a start quicker than this: no flash.)
const COVER_AFTER_MS = 300;
const SIGNED_IN_MS = 2400;

interface AuthValue {
  account: Account | null;
  setAccount: (account: Account) => void;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthValue>({ account: null, setAccount: () => {}, signOut: async () => {} });
export const useAccount = () => useContext(AuthContext);

export function AuthGate({ children }: { children: ReactNode }) {
  const { colors } = useOrbitTheme();
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
  // (Just signed in: when, and where the sign-in page's orb was — `from`.)
  const signedInAt = useRef(0);
  const [from, setFrom] = useState<OrbStart | null>(null);
  const [covered, setCovered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const accountId = account?._id;
  useEffect(() => {
    if (state !== "signedIn" || !accountId) return;
    let over = false;
    const signedIn = Date.now() - signedInAt.current < SIGNED_IN_MS;
    setLeaving(false);
    setProgress(null);
    const finish = () => {
      if (over) return;
      over = true;
      setLeaving(true);
    };
    const cover = signedIn ? undefined : setTimeout(() => !over && setCovered(true), COVER_AFTER_MS);
    const limit = setTimeout(finish, WARM_UP_MS);
    void preload((done, total) => !over && setProgress({ done, total })).finally(() => {
      const wait = signedIn ? SIGNED_IN_MS - (Date.now() - signedInAt.current) : 0;
      if (wait > 0) setTimeout(finish, wait);
      else finish();
    });
    return () => {
      over = true;
      clearTimeout(cover);
      clearTimeout(limit);
    };
  }, [state, accountId]);
  const gone = useCallback(() => {
    setCovered(false);
    setLeaving(false);
    setFrom(null);
  }, []);

  if (state === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  if (state === "signedOut") {
    return (
      <SignInScreen
        notice={notice}
        onSignedIn={(next, at) => {
          setNotice(null);
          signedInAt.current = Date.now();
          setFrom(at);
          setCovered(true);
          setAccount(next);
        }}
      />
    );
  }
  return (
    <AuthContext.Provider value={{ account, setAccount, signOut }}>
      <View style={{ flex: 1 }}>
        {children}
        {covered && <LoadingOrbit from={from} name={account?.name.split(" ")[0] ?? ""} progress={progress && progress.total ? progress.done / progress.total : 0} leaving={leaving} onGone={gone} />}
      </View>
    </AuthContext.Provider>
  );
}
