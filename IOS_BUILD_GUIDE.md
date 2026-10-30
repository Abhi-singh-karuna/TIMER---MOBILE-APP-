# iOS Build Guide

Covers both **Debug** (development) and **Release** (production/sideloading) builds for Chronoscape.

The Xcode workspace is `ios/CHRONOSCAPE.xcworkspace`.

---

## Quick comparison

| | Debug (Development) | Release (Production) |
|---|---|---|
| JS loading | Live from Metro server | Bundled into the binary |
| Performance | Slower (dev overhead) | Optimized |
| Live reload | Yes | No |
| Use for | Coding and testing | AltStore / sideloading |

---

## Prerequisites

- Mac with Xcode installed
- CocoaPods: `sudo gem install cocoapods`
- Node.js and npm
- Apple ID logged into Xcode (**Settings > Accounts**)

---

## Common setup (required for both modes)

Run these first to prepare the environment:

```bash
# 1. Install JS dependencies
npm install

# 2. Check/fix Expo version alignment
npx expo install --check

# 3. Generate or sync the ios/ native project
npx expo prebuild --platform ios

# 4. Install CocoaPods
cd ios && pod install && cd ..
```

> Run `npx expo prebuild --platform ios` again any time you update `app.json`, add a native plugin, or change app icons/splash screen assets.

---

## Debug mode (development build)

Use this while building features or debugging.

```bash
# Start the Metro dev server
npx expo start --clear

# Build and run on iOS simulator (in a separate terminal)
npx expo run:ios
```

Alternatively, open `ios/CHRONOSCAPE.xcworkspace` in Xcode, ensure the scheme is **Debug**, and press **Play (▶)**.

---

## Release mode (production build)

Use this to create a standalone `.ipa` for sideloading via AltStore.

### Step 1 — Generate the standalone JS bundle

```bash
npx react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output ios/main.jsbundle \
  --assets-dest ios
```

This creates `ios/main.jsbundle` and copies assets into `ios/`. Both must exist before archiving.

### Step 2 — Open the workspace

```bash
open ios/CHRONOSCAPE.xcworkspace
```

### Step 3 — Set the scheme to Release

1. **Product > Scheme > Edit Scheme...**
2. Select **Run** in the left sidebar.
3. Set **Build Configuration** to **Release**.
4. Click **Close**.

### Step 4 — Link the JS bundle (first time only)

If `main.jsbundle` does not appear in the Xcode file tree under the CHRONOSCAPE folder:

1. Right-click the **CHRONOSCAPE** folder in the sidebar → **Add Files to "CHRONOSCAPE"...**
2. Select `ios/main.jsbundle` and the `ios/assets` folder.
3. Check **"Create folder references"** and ensure the **CHRONOSCAPE** target is selected.

### Step 5 — Archive and export

1. In the top bar, select **Any iOS Device (arm64)**.
2. Go to **Product > Archive** and wait for compilation.
3. In the Organizer window, click **Distribute App**.
4. Choose **Development** (for AltStore / sideloading) and follow the prompts to export.
5. You will have a folder containing the `.ipa` file.

---

## Sideloading via AltStore

1. Ensure **AltServer** is running on your Mac.
2. Connect your iPhone to the same Wi-Fi network.
3. Open **AltStore** on your phone → tap **+** → select your `.ipa` file.
4. AltStore will install the app and manage the 7-day certificate refresh automatically.

---

## Updating app icons and branding

After changing files in `assets/` (e.g., `icon.png`, `splash-icon.png`):

```bash
npx expo prebuild --platform ios
```

This reads `app.json` and `assets/` and regenerates `ios/CHRONOSCAPE/Images.xcassets`.

---

## Troubleshooting

### "Build input file cannot be found: main.jsbundle"

You ran the archive without first bundling JS. Run the `npx react-native bundle ...` command from Step 1, then verify `ios/main.jsbundle` exists and is linked in the Xcode file tree.

### Stale node_modules references (nested expo packages)

If Xcode reports missing files inside `node_modules/expo/node_modules/...`:

```bash
# Deep clean
rm -rf node_modules
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData

# Reinstall
npm install
npx expo prebuild --platform ios
cd ios && pod install --repo-update && cd ..
```

### "Provisioning Profile Expired"

Free Apple Developer (Personal Team) certificates are valid for **7 days**. When expired:

1. Open `ios/CHRONOSCAPE.xcworkspace`.
2. Select the project in the sidebar → **Signing & Capabilities** tab.
3. If **Automatically manage signing** is checked, click **Try Again** or **Repair** if visible.
4. If that fails: uncheck and re-check **Automatically manage signing**. Xcode will regenerate the profile.
5. Ensure your Apple ID is still logged in under **Xcode > Settings > Accounts**.

### "Personal development teams do not support Push Notifications"

Free accounts cannot use remote Push Notifications. Local timer notifications still work without it.

1. Open `ios/CHRONOSCAPE.xcworkspace`.
2. Select the project → **Signing & Capabilities** tab.
3. Click **×** next to **Push Notifications** to remove it.
4. Under **Background Modes**, uncheck **Remote notifications** if checked.
5. Build again.

### Icons not updating after asset change

Run `npx expo prebuild --platform ios` to regenerate native assets, then rebuild in Xcode.
