# BentoBuilder

## Branch workflow

- `WorkingSave` — always-stable branch. This is what gets deployed to Render and built into the real "BentoBuilder" app on your phone.
- Feature branches — day-to-day development. Test these with the Simulator or the dev-client ("BentoBuilder Beta") app, never deployed directly.
- When a feature is done: merge into `WorkingSave`, push (redeploys Render), then cut a fresh EAS build if you want your phone's real app updated (release builds are a snapshot, not auto-updating).

## Backend / server

Requires `server/.env` with `MONGODB_URI` set (see `server/.env.example`). `PORT` is optional, defaults to 5050.

Run locally:
```
cd server
npm run dev
```

The server is also deployed on Render at https://bentobuilder.onrender.com, tracking the `WorkingSave` branch. Non-dev mobile builds (anything without a Metro dev server attached) call this automatically — see `mobile/src/config/api.ts`. The free tier sleeps after ~15 min idle; the first request after a gap can take 30-50s to wake it back up.

## Mobile app

Two build variants share this codebase so they can be installed on the same phone at once as separate apps (see `mobile/app.config.js`):

| | Name | Bundle ID | Icon | Purpose |
|---|---|---|---|---|
| Default | BentoBuilder | `com.damienlo.bentobuilder` | `BentoBox_App_Icon.png` | The real app — built from `WorkingSave` via EAS, used day to day |
| `APP_VARIANT=development` | BentoBuilder Beta | `com.damienlo.bentobuilder.dev` | `BentoBox_Beta_App_Icon.png` | Dev client — for testing feature branches locally |

`mobile/ios/` is gitignored — it's regenerated locally (via `expo prebuild` or `expo run:ios`), never committed. Nothing there needs to be hand-preserved.

### One-time setup (already done on this machine)

- `expo-dev-client` installed
- CocoaPods + Watchman installed (`brew install cocoapods watchman`)
- Signed into an Apple ID in Xcode (Xcode > Settings > Accounts)
- Enrolled in the Apple Developer Program ($99/year — required for EAS builds; without it, free-tier local builds expire after 7 days)
- Logged into EAS (`npx eas-cli login`), project linked, this phone registered (`npx eas-cli device:create`)
- First EAS build only: it'll interactively ask to generate a Distribution Certificate + Provisioning Profile — say yes, EAS stores them on its servers after that so future builds don't ask again
- Each bundle ID needs Xcode to register it with Apple once before it can build/sign locally: open `mobile/ios/mobile.xcworkspace` in Xcode, select the target, confirm the team under Signing & Capabilities, and hit Run once with the device selected. Already done for both `com.damienlo.bentobuilder` and `com.damienlo.bentobuilder.dev` on this machine — only needed again if the bundle ID ever changes or on a new Mac.

### ⚠️ Switching which variant you build locally

`expo run:ios` does **not** resync the bundle ID/name into the native Xcode project by itself — those are static values written into `ios/mobile.xcodeproj/project.pbxproj` only by `expo prebuild`. If you build one variant locally and then build the other without an explicit prebuild in between, the second build silently signs under the **previous** variant's bundle ID instead of the one you asked for (it'll still say "Build Succeeded," so this doesn't announce itself). Before switching, always run:
```
APP_VARIANT=development npx expo prebuild --platform ios   # for Beta
# or
npx expo prebuild --platform ios                            # for the real app
```
then build as normal. `npm run ios:dev` doesn't do this for you.

### Dev client ("BentoBuilder Beta") — for building/testing feature branches

Day to day, once the dev client is installed, you only need Metro running:
```
cd mobile
npm run start:dev
```
The already-installed "BentoBuilder Beta" app connects to it automatically — switching feature branches just means `git checkout <branch>` + restarting this command, no reinstall needed.

Only rebuild/reinstall the dev client itself if a branch adds a **new native dependency** (pure JS/React changes never need this), and only after the prebuild step above if the last local build was the other variant:
1. Connect the iPhone to the Mac via USB, trust the computer if prompted.
2. On the iPhone: Settings > Privacy & Security > Developer Mode > on. Has to stay on the whole time you want to use the app.
3. From `mobile/`:
   ```
   npm run ios:dev
   ```
4. First install of a rebuilt app: Settings > General > VPN & Device Management > trust the developer profile again, then open the app from the home screen (it won't auto-launch the very first time after a signature change).

### Real build ("BentoBuilder") — from `WorkingSave`, via EAS

Only needed after merging a finished feature into `WorkingSave` and wanting your phone's real app updated:
```
cd mobile
npx eas-cli build --platform ios --profile preview
```
EAS builds in the cloud (no Mac/USB needed, unaffected by whatever variant you last built locally) and prints a link — open it in **Safari on the iPhone** to install the `.ipa` directly, no App Store/TestFlight needed. Signed with your paid Apple Developer account, so it doesn't expire after 7 days like free-tier local builds do. Installing over an existing copy is a normal in-place update — no need to delete the old one first, even if the name/icon changed.
