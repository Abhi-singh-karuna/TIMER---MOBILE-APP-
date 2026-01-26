# 🍎 iOS Production Release Guide

This guide provides the exact, step-by-step workflow to prepare the **TIMER APP** for a production-ready release build using local Xcode. Follow these steps sequentially to ensure your app is optimized and self-contained.

---

## 🛠 Phase 1: Environment Preparation
Before building, ensure your local environment is synchronized with the latest project configuration.

1.  **Install JS Dependencies**:
    ```bash
    npm install
    ```
2.  **Sync Native Projects**:
    Run this if you changed `app.json`, icons, or added new native plugins.
    ```bash
    npx expo prebuild --platform ios
    ```
3.  **Validate Dependencies**:
    Ensure all native modules are compatible with your Expo version.
    ```bash
    npx expo install --check
    ```
4.  **Install CocoaPods**:
    ```bash
    cd ios && pod install && cd ..
    ```

---

## 📦 Phase 2: Generating the Production Bundle
This step "bakes" your Javascript code and assets into a static file so the app can run without a development server.

Run the following command from the **root directory**:

```bash
npx react-native bundle \
--platform ios \
--dev false \
--entry-file index.js \
--bundle-output ios/main.jsbundle \
--assets-dest ios
```

> [!IMPORTANT]
> This command creates `ios/main.jsbundle` and an `assets` folder inside `ios/`. These must be present for the Release build to work.

---

## 🏛 Phase 3: Xcode Configuration
1.  **Open the Project**:
    ```bash
    open ios/TIMERAPP.xcworkspace
    ```
2.  **Set Build Configuration to Release**:
    - Go to **Product > Scheme > Edit Scheme...**
    - Select **Run** (left sidebar).
    - Change **Build Configuration** to **Release**.
    - Click **Close**.
3.  **Link the Bundle (First-time only)**:
    - If `main.jsbundle` is not visible in the Xcode file tree (under the TIMERAPP folder):
        - Right-click the **TIMERAPP** folder → **Add Files to "TIMERAPP"...**
        - Select `ios/main.jsbundle` and the `ios/assets` folder.
        - **Check**: "Create folder references" and ensure the "TIMERAPP" target is selected.

---

## 🚀 Phase 4: Archiving and Exporting
1.  **Select Build Target**:
    In the top bar, select **Any iOS Device (arm64)**.
2.  **Create Archive**:
    - Go to **Product > Archive**.
    - Wait for Xcode to finish compiling.
3.  **Distribute**:
    - In the Organizer window that pops up, click **Distribute App**.
    - Choose **Development** (for AltStore/sideloading) or **TestFlight/App Store**.
    - Follow the prompts to **Export**.
4.  **Locate IPA**:
    - Once finished, you will have a folder containing the `.ipa` file.

---

## 🆘 Common Troubleshooting
- **"Build input file cannot be found: main.jsbundle"**: Ensure you ran the bundling command in Phase 2 and that the file is added to your Xcode project.
- **Push Notification Errors**: If you don't have a paid developer account, go to **Signing & Capabilities** and remove the "Push Notifications" capability.
- **Icons not updating**: Run `npx expo prebuild --platform ios` and then rebuild in Xcode.

---
**Last Updated**: 2026-01-26
