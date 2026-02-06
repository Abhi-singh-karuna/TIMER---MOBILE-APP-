# Comprehensive iOS Build Guide: Debug vs. Release

This guide covers two distinct workflows for the **TIMER_APP**: **Debug Mode** (for development) and **Release Mode** (for production/sideloading).

## 1. Quick Comparison

| Feature | Debug Mode (Development) | Release Mode (Production) |
| :--- | :--- | :--- |
| **JS Loading** | Loaded live from Metro server | Bundled into the app binary |
| **Performance** | Slower (overhead for debugging) | Optimized and fast |
| **Live Reload** | Enabled (instant UI updates) | Disabled |
| **Usage** | Simulator or testing while coding | Sideloading via AltStore |

---

## 2. Prerequisites
- **Mac with Xcode installed**.
- **CocoaPods**: `sudo gem install cocoapods`.
- **Node.js & npm**: Installed.
- **Apple ID**: Logged into Xcode (**Settings > Accounts**).

---

## 3. COMMON SETUP (Required for both)
Run these commands first to prepare the environment:
```bash
# 1. Install JS dependencies
npm install

# 2. Fix/Align Expo versions
npx expo install --check

# 3. Generate the 'ios' directory
npx expo prebuild --platform ios
```

---

## 4. DEVELOPMENT (Debug Mode)
Use this mode while building features or debugging.

1. **Start Development Server**:
   ```bash
   npx expo start --clear
   ```
2. **Run on Simulator/Device**:
   - In a new terminal: `npx expo run:ios`
   - *Alternative*: Open `ios/TIMERAPP.xcworkspace` in Xcode, ensure the scheme is **Debug**, and press **Play (▶)**.

---

## 5. DISTRIBUTION (Release Mode)
Use this mode to create a standalone app for sideloading via AltStore.

### Step A: Generate the Standalone JS Bundle
This command compiles your code and assets into a single static file.
```bash
npx react-native bundle \
--platform ios \
--dev false \
--entry-file index.js \
--bundle-output ios/main.jsbundle \
--assets-dest ios
```

### Step B: Xcode Configuration
1. **Open Workspace**: `open ios/TIMERAPP.xcworkspace`.
2. **Set Scheme to Release**:
   - **Product > Scheme > Edit Scheme...**.
   - Select **Run** (left) > Set **Build Configuration** to **Release**.
3. **Add the JS Bundle to Xcode**:
   - Right-click the **TIMERAPP** folder in Xcode sidebar.
   - Select **Add Files to "TIMERAPP"...**.
   - Choose `ios/main.jsbundle`.
   - **CRITICAL**: Check "Create folder references" and ensure "TIMERAPP" target is checked.

### Step C: Archive and Export
1. Select **Any iOS Device (arm64)** from the device menu at the top.
2. Go to **Product > Archive**.
3. In the Organizer window, click **Distribute App**.
4. Choose **Development** and follow the prompts to **Export** your `.ipa` file.

---

## 6. Sideloading via AltStore
1. Ensure **AltServer** is running on your Mac.
2. Connect your iPhone to the same Wi-Fi.
3. Open **AltStore** on your phone > Tap **+** > Select your `.ipa` file.
4. AltStore will install the app and manage the 7-day refresh automatically.

---
## 7. Troubleshooting: "Build input file cannot be found"
If you see errors related to missing files in `node_modules/expo/node_modules/expo-keep-awake/...`, it means Xcode has stale references to nested dependencies.

### The Fix: Deep Clean
Run these commands in order to reset your environment:
```bash
# 1. Clear caches and build folders
rm -rf node_modules
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData

# 2. Reinstall JS dependencies
npm install

# 3. Synchronize Native Modules
npx expo prebuild --platform ios
cd ios && pod install --repo-update
```

---
## 8. Updating the App Logo & Branding
If you have updated the files in the `assets/` folder (like `icon.png` or `splash-icon.png`), you must synchronize these changes with the native `ios` folder before building.

Run this command to update the native icons and splash screen:
```bash
npx expo prebuild --platform ios
```
*Note: This command reads your `app.json` and `assets/` folder to regenerate the native assets in `ios/TIMERAPP/Images.xcassets`.*

---
## 9. Common Errors: Provisioning & Capabilities

### Error: "Provisioning Profile Expired"
This happens because free Apple Developer accounts (Personal Teams) only grant certificates valid for **7 days**. When it expires, the app will fail to install or open.

**The Fix:**
1. Open `ios/TIMERAPP.xcworkspace` in Xcode.
2. Select the **TIMERAPP** project in the left sidebar.
3. Go to the **Signing & Capabilities** tab.
4. You will likely see a red error message.
5. **Option A**: Run the app again via Xcode (**Play** button). Xcode usually attempts to renew the certificate automatically upon build.
6. **Option B**: If it fails, uncheck **"Automatically manage signing"**, wait a moment, and re-check it. Select your "Personal Team" again. This forces a fresh fetch.

### Error: "Personal development teams do not support Push Notifications"
If you are using a free Apple Developer account (Personal Team), you must remove the **Push Notifications** capability, as it is only for paid developer accounts. Local timer notifications will still work without it.

**The Fix:**
1. Open `ios/TIMERAPP.xcworkspace` in Xcode.
2. Select the **TIMERAPP** project in the left sidebar.
3. Go to the **Signing & Capabilities** tab.
4. Find **Push Notifications** and click the **x** icon to delete it.
5. Find **Background Modes** and **uncheck** "Remote notifications" if it is checked.
6. Try building again.

---
**Tip**: Always use **Debug Mode** for coding and **Release Mode** only when you want to test the final, polished app on your device without being connected to the computer.
