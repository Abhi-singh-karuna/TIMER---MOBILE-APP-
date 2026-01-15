# Timer App - Professional Mobile Timer

A sleek, high-performance timer application built with React Native and Expo. It features a stunning dynamic UI, micro-second smooth animations, and full orientation support.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo Go](https://expo.dev/go) app on your iOS or Android device

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Abhi-singh-karuna/TIMER---MOBILE-APP-.git
   cd TIMER---MOBILE-APP-
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

### Running the App

1. **Start the Expo server**
   ```bash
   npx expo start --clear
   ```

2. **Open the app**
   - **iOS:** Open the Camera app and scan the QR code from the terminal.
   - **Android:** Open the Expo Go app and scan the QR code.
   - **Development:** Press `i` for iOS simulator or `a` for Android emulator (if configured).

---

## ✨ Key Features

### 1. Dynamic Layouts
- **Portrait Mode:** Clean, card-based interface with daily progress analytics.
- **Landscape Mode (Pro):** A revolutionary full-screen experience with an immersive progress filler and large, readable digits.

### 2. Ultra-Smooth Animation
- The landscape filler uses a synchronized timing formula matching the timer interval (1000ms) for perfectly continuous, micro-step movement.

### 3. Deep Customization
- Independently customize:
  - **Filler Color**
  - **Slider & Button Colors**
  - **Timer Text Color**
- Personalization is persisted automatically via `AsyncStorage`.

### 4. Smart Orientation
- The app automatically detects device rotation and transitions layouts smoothly with a cross-fade effect.

---

## 🛠️ Tech Stack

- **Framework:** React Native / Expo
- **Language:** TypeScript
- **Navigation:** React Navigation
- **Storage:** @react-native-async-storage/async-storage
- **Graphics:** Expo Linear Gradient, Material Icons

---

## 📁 Project Structure

- `App.tsx`: Central state and color management.
- `/src/screens`:
  - `TimerList.tsx`: Main dashboard & analytics.
  - `ActiveTimer.tsx`: The heart of the app (Portrait & Landscape layouts).
  - `SettingsScreen.tsx`: Color customization & live preview.
- `/src/components`: Reusable UI elements like `SlideToComplete`.
