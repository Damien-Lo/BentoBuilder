import Constants from "expo-constants";

const SERVER_PORT = 5050;
const FALLBACK_HOST = "172.31.85.48";

// In dev builds, derive the API host from the Metro dev server's address
// (Constants.expoConfig.hostUri, e.g. "172.31.85.48:8081") so this doesn't
// break every time the Mac's LAN IP changes. Falls back to a fixed host
// when there's no dev server to read from (e.g. a release build).
const devServerHost = Constants.expoConfig?.hostUri?.split(":")[0];

// Base URL for the API to be called by all frontend calls
export const API_BASE_URL = `http://${devServerHost || FALLBACK_HOST}:${SERVER_PORT}`;
