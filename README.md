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

| | Name | Bundle ID | Purpose |
|---|---|---|---|
| Default | BentoBuilder | `com.damienlo.bentobuilder` | The real app — built from `WorkingSave` via EAS, used day to day |
| `APP_VARIANT=development` | BentoBuilder Beta | `com.damienlo.bentobuilder.dev` | Dev client — for testing feature branches locally |

### One-time setup (already done on this machine)

- `expo-dev-client` installed
- CocoaPods + Watchman installed (`brew install cocoapods watchman`)
- Signed into an Apple ID in Xcode (Xcode > Settings > Accounts)
- Enrolled in the Apple Developer Program ($99/year — required for EAS builds; without it, free-tier local builds expire after 7 days)
- Logged into EAS (`npx eas-cli login`), project linked, this phone registered (`npx eas-cli device:create`)

### Dev client ("BentoBuilder Beta") — for building/testing feature branches

Day to day, once the dev client is installed, you only need Metro running:
```
cd mobile
npm run start:dev
```
The already-installed "BentoBuilder Beta" app connects to it automatically — switching feature branches just means `git checkout <branch>` + restarting this command, no reinstall needed.

Only rebuild/reinstall the dev client itself if a branch adds a **new native dependency** (pure JS/React changes never need this):
1. Connect the iPhone to the Mac via USB, trust the computer if prompted.
2. On the iPhone: Settings > Privacy & Security > Developer Mode > on. Has to stay on the whole time you want to use the app.
3. From `mobile/`:
   ```
   npm run ios:dev
   ```

### Real build ("BentoBuilder") — from `WorkingSave`, via EAS

Only needed after merging a finished feature into `WorkingSave` and wanting your phone's real app updated:
```
cd mobile
npx eas-cli build --platform ios --profile preview
```
EAS builds in the cloud (no Mac/USB needed) and gives a link/QR code to install the `.ipa` directly on the phone — signed with your paid Apple Developer account, so it doesn't expire after 7 days like free-tier local builds do.
