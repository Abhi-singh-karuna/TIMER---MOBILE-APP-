# Local iOS Build & Setup Guide

This guide documents the steps taken to build the **TIMER_APP** locally on a Mac using Xcode and how to maintain it for free using AltStore.

## 1. Prerequisites
- **Mac with Xcode installed** (from App Store).
- **CocoaPods**: Install via `sudo gem install cocoapods`.
- **Node.js & npm**: Installed on your system.
- **Apple ID**: For code signing.

## 2. Project Configuration
Ensure your `app.json` has a unique `bundleIdentifier`:
```json
"ios": {
  "bundleIdentifier": "com.abhisheksingh.timerapp",
  "supportsTablet": true
}
```

## 3. Generating Native Files
Run the following command to generate the `ios` directory:
```bash
npx expo prebuild --platform ios
```
*This command also installs the necessary CocoaPods dependencies.*

## 4. Opening in Xcode
Always open the `.xcworkspace` file, not the `.xcodeproj`:
```bash
open ios/TIMERAPP.xcworkspace
```

## 5. Xcode Signing & Capabilities
1. Select the **TIMERAPP** project in the left sidebar.
2. Select the **TIMERAPP** target.
3. Go to the **Signing & Capabilities** tab.
4. Select your **Development Team**.
5. Ensure the **Bundle Identifier** matches your `app.json`.

## 6. Building and Installing
- **Simulator**: Select a simulator from the top menu and press **Play (▶)**.
- **Physical Device**: Connect your iPhone, select it from the menu, and press **Play (▶)**.
  - *Note: If using a physical device with a free account, the build will expire in 7 days.*

## 7. Generating an `.ipa` for AltStore
To create a file you can sideload:
1. Select **Any iOS Device (arm64)** from the device list at the top.
2. Go to **Product > Archive**.
3. In the Organizer window, click **Distribute App**.
4. Select **Development** and follow the prompts to **Export**.

## 8. Permanent Access (AltStore)
To bypass the 7-day limit without paying $99/year:
1. Install **AltServer** on your Mac.
2. Install **AltStore** on your iPhone.
3. Enable **Wi-Fi Sync** in Finder/iTunes for your iPhone.
4. Sideload your `.ipa` file using AltStore on your phone.
5. AltStore will automatically refresh the app whenever you are on the same Wi-Fi as your Mac.

---
**Note**: Your local data (AsyncStorage) is preserved during updates or refreshes via both Xcode and AltStore.
