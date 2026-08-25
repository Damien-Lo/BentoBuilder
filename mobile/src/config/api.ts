import Constants from "expo-constants";

const SERVER_PORT = 5050;
const LOCAL_FALLBACK_HOST = "172.31.85.48";
const DEPLOYED_API_URL = "https://bentobuilder.onrender.com";

// In dev builds, derive the API host from the Metro dev server's address
// (Constants.expoConfig.hostUri, e.g. "172.31.85.48:8081") so this doesn't
// break every time the Mac's LAN IP changes. Falls back to a fixed host
// when there's no dev server to read from.
const devServerHost = Constants.expoConfig?.hostUri?.split(":")[0];

// Base URL for the API to be called by all frontend calls. The dev client
// attached to Metro talks to the local server directly, for fast
// iteration without a Render round-trip. Any other build (release/
// standalone, or the dev client launched with no Metro attached) talks to
// the deployed server, which is reachable from anywhere.
export const API_BASE_URL = __DEV__
  ? `http://${devServerHost || LOCAL_FALLBACK_HOST}:${SERVER_PORT}`
  : DEPLOYED_API_URL;
