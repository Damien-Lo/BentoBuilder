import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/api";
import type { NutritionLabelScan } from "@/src/services/ingredientApi";

// This device, as the server knows it (see server/models/Device.js): one of
// the devices of the account signed in on it, so a computer can ask "my
// phone" to take a photo (a barcode, a nutrition label, a receipt) with
// nothing to pair. The device's id and secret are kept here (localStorage in
// a browser) and sent with each request; signing out forgets them, so the
// next account to sign in registers the device as its own.

export interface DeviceInfo {
  _id: string;
  kind: "phone" | "computer";
  name: string;
  lastSeenAt?: string;
}
export interface ThisDevice extends DeviceInfo {
  // The account's other phones and computers.
  others: DeviceInfo[];
}
interface Identity {
  _id: string;
  secret: string;
  kind: "phone" | "computer";
}

const KEY = "@bentobuilder/device";
export const thisKind: "phone" | "computer" = Platform.OS === "web" ? "computer" : "phone";

function defaultName(): string {
  if (Platform.OS !== "web") return Platform.OS === "ios" ? "iPhone" : "Phone";
  const agent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : /Firefox\//.test(agent) ? "Firefox" : "Browser";
  const os = /Mac OS X/.test(agent) ? "Mac" : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : "Computer";
  return `${os} · ${browser}`;
}

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string; code?: string } | null;
  if (!response.ok || !data?.success) {
    const error = new Error(data?.message ?? `Request failed (${response.status})`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data.data as T;
}

let identity: Promise<Identity> | null = null;
// This device's id and secret, registering it the first time.
function getIdentity(): Promise<Identity> {
  identity ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved) return JSON.parse(saved) as Identity;
    } catch {
      // (Unreadable: register afresh.)
    }
    const made = await parse<Identity & DeviceInfo>(await fetch(`${API_BASE_URL}/api/devices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: thisKind, name: defaultName() }) }));
    const kept = { _id: made._id, secret: made.secret, kind: made.kind };
    await AsyncStorage.setItem(KEY, JSON.stringify(kept)).catch(() => {});
    return kept;
  })();
  return identity;
}

// A request as this device. A server that doesn't know it (forgotten, a
// fresh database, another account's) means registering again, once.
async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const me = await getIdentity();
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-device-id": me._id, "x-device-secret": me.secret, ...(init.headers ?? {}) },
  });
  if (response.status === 404 && !retried) {
    const body = (await response.clone().json().catch(() => null)) as { code?: string } | null;
    if (body?.code === "unknown-device") {
      identity = null;
      await AsyncStorage.removeItem(KEY).catch(() => {});
      return call<T>(path, init, true);
    }
  }
  return parse<T>(response);
}

export const getThisDevice = () => call<ThisDevice>("/devices/me");
export const renameThisDevice = (name: string) => call<void>("/devices/me", { method: "PATCH", body: JSON.stringify({ name }) });
// Forgets another of the account's devices (one no longer used).
export const forgetDevice = (id: string) => call<void>(`/devices/${id}`, { method: "DELETE" });
// Whether the account has a phone to ask (none: open the app on one).
export const hasPhone = async () => (await getThisDevice()).others.some((d) => d.kind === "phone") || thisKind === "phone";

// --- Camera requests: a computer asking its phone for a photo ------------

export type CaptureKind = "barcode" | "label" | "receipt";
export interface CaptureRequest {
  _id: string;
  kind: CaptureKind;
  label: string;
  status: "waiting" | "capturing" | "done" | "cancelled" | "failed";
  error: string;
  result: { barcode?: string; photoUrl?: string; scan?: NutritionLabelScan; draftId?: string } | null;
  createdAt: string;
}

export const requestCapture = (kind: CaptureKind, label = "") => call<CaptureRequest>("/capture", { method: "POST", body: JSON.stringify({ kind, label }) });
export const getCapture = (id: string) => call<CaptureRequest>(`/capture/${id}`);
// Called off — with `reason` when it failed on the phone (the computer is told).
export const cancelCapture = (id: string, reason?: string) => call<CaptureRequest>(`/capture/${id}`, { method: "DELETE", ...(reason ? { body: JSON.stringify({ reason }) } : {}) });
export const nextCapture = () => call<CaptureRequest | null>("/capture/next");
export const claimCapture = (id: string) => call<CaptureRequest>(`/capture/${id}/claim`, { method: "POST" });
export const sendCaptureBarcode = (id: string, barcode: string) => call<CaptureRequest>(`/capture/${id}/result`, { method: "POST", body: JSON.stringify({ barcode }) });
export const sendCapturePhoto = (id: string, photo: { base64: string; width: number; height: number }) =>
  call<CaptureRequest>(`/capture/${id}/result`, { method: "POST", body: JSON.stringify({ imageBase64: photo.base64, mediaType: "image/jpeg", width: photo.width, height: photo.height }) });

// Waits for a request to be answered (or called off), checking every
// `every` ms; `onUpdate` sees each change of state. Returns the request as
// it ended. `stop()` cancels it.
export function watchCapture(id: string, onUpdate: (request: CaptureRequest) => void, every = 1500): { done: Promise<CaptureRequest>; stop: () => void } {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    void cancelCapture(id).catch(() => {});
  };
  const done = (async () => {
    let last = "";
    for (;;) {
      if (stopped) throw new Error("cancelled");
      const request = await getCapture(id).catch(() => null);
      if (request) {
        if (request.status !== last) onUpdate(request);
        last = request.status;
        if (["done", "cancelled", "failed"].includes(request.status)) return request;
      }
      await new Promise((resolve) => setTimeout(resolve, every));
    }
  })();
  return { done, stop };
}
