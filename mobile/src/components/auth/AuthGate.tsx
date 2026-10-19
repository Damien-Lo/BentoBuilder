import AsyncStorage from "@react-native-async-storage/async-storage";
import { reloadAppAsync } from "expo";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

import { getMe, installAuthFetch, loadToken, onSessionEnded, signOut as endSession, type Account } from "@/src/services/authApi";

import { SignInScreen } from "./SignInScreen";

// The app, once this device is signed in — the sign-in page until then.
// Whoever is signed in is available to any screen (useAccount). They're
// remembered on the device too, so the app still opens without a
// connection; if the server says the session has ended, it's back to the
// sign-in page.

installAuthFetch();

const ACCOUNT_KEY = "bentobuilder.account";

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
  return <AuthContext.Provider value={{ account, setAccount, signOut }}>{children}</AuthContext.Provider>;
}
