# BentoBuilder

RUN Frontend:
npx expo start --clear

RUN Backend:
cd "../server"
npm run dev

RUN on iPhone (physical device, via dev client):
One-time setup already done on this machine: `expo-dev-client` installed, CocoaPods + Watchman installed (via `brew install cocoapods watchman`), `ios.bundleIdentifier` set in mobile/app.json.

Each time you want to (re)install onto the phone:

1. Connect the iPhone to the Mac via USB, trust the computer if prompted.
2. On the iPhone: Settings > Privacy & Security > Developer Mode > on. This has to stay on the whole time you want to use the app, not just during install — switching it off stops the app from launching until it's turned back on.
3. On the Mac: Xcode > Settings > Accounts > make sure your Apple ID is signed in.
4. From mobile/: npx expo run:ios --device

Free Apple ID builds expire after 7 days — just re-run step 4 to reinstall. (An Apple Developer Program account, $99/year, removes the 7-day expiry and lets EAS Build install over the air instead of over USB.)
