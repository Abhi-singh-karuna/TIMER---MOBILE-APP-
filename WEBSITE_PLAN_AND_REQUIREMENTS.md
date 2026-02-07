# 🌐 Website Plan & Requirements: Timer App

This document outlines everything needed to create a professional website for your Timer App. Depending on your goal, this website can serve two primary purposes:
1.  **Marketing Landing Page:** To showcase the app and drive downloads.
2.  **Web Application:** A fully functional version of the timer running in the browser.

---

## 1. 🎯 Define the Goal
Before starting, decide on the primary focus:
*   **Option A: Marketing Site (Recommended for Mobile Apps)**
    *   *Goal:* Convince users to download the iOS/Android app.
    *   *Content:* Hero section, features, testimonials, screenshots, download links.
*   **Option B: Web App (SaaS)**
    *   *Goal:* Allow users to use the timer directly in their browser.
    *   *Tech:* You can reuse your existing React Native code using `react-native-web`.

*(This document focuses on the **Marketing Site** as it's the standard first step for mobile apps, but includes a section on the Web App option.)*

---

## 2. 📦 Assets & Content You Need to Gather

### A. Branding Assets
*   **App Icon:** High-resolution (1024x1024px) PNG/SVG.
*   **Logo:** A horizontal version of your logo (Icon + Text) for the website header.
*   **Color Palette:**
    *   Primary: The main brand color (from your app).
    *   Secondary: Accent colors used in the app (e.g., your category colors).
    *   Backgrounds: Dark/Light mode hex codes.
*   **Typography:** The font files used in the app (`Plus Jakarta Sans` & `Inter`).

### B. Visuals & Media
*   **Device Mockups:** High-quality screenshots of the app running on iPhone 15 / Pixel 8 frames.
    *   *Screens to capture:* Home/Timer List, Active Timer (Landscape Focus Mode), Settings.
*   **Demo Video:** A short (15-30s) video showing:
    1.  Starting a timer.
    2.  Rotating to landscape (showing the smooth transition).
    3.  Completing a task.
*   **Favicon:** A small 32x32px version of your logo for the browser tab.

### C. Copywriting (Text)
*   **Headline:** A catchy one-liner (e.g., *"Master Your Time with Precision & Style"*).
*   **Sub-headline:** A brief description (e.g., *"The professional timer for productivity enthusiasts. Available mainly on iOS & Android."*).
*   **Feature List:** 3-4 key selling points:
    *   *Dynamic Landscape Mode*
    *   *Smart Recurring Tasks*
    *   *Distraction-Free Focus*
*   **Social Proof:** (Optional) User reviews or "As seen on" badges.
*   **Call to Action (CTA):** "Download on the App Store", "Get it on Google Play".

### D. Legal & Support
*   **Privacy Policy:** Required by Apple/Google. A simple page explaining data usage.
*   **Terms of Service:** Standard usage terms.
*   **Support Email:** A contact email (e.g., `support@timerapp.com`).

---

## 3. 🛠️ Technology Stack Recommendations

### Recommendation: Next.js + Tailwind CSS
*   **Why?** Fast, SEO-friendly, and easy to host.
*   **Framework:** **Next.js** (React-based, great for static sites).
*   **Styling:** **Tailwind CSS** (Rapid styling that can match your app's design tokens).
*   **Animations:** **Framer Motion** (To replicate the app's smooth "micro-second" animations on the web).
*   **Hosting:** **Vercel** (Zero-config deployment, free tier is sufficient).

### Alternative: No-Code Builders
*   If you want to move fast without coding: **Framer** or **Webflow**.

---

## 4. 🗺️ Website Sitemaps

### One-Page Landing Site (MVP)
1.  **Hero Section:** Large headline, app mockups, "Download" buttons.
2.  **Features Grid:** Cards showing off specific features (Focus Mode, Analytics).
3.  **How it Works:** Simple 3-step graphic (Set -> Focus -> Track).
4.  **Footer:** Copyright, Social Links, Privacy Policy link.

### Full Site Structure
*   `/` (Home)
*   `/features` (Deep dive into functionality)
*   `/download` (Direct links or QR codes)
*   `/privacy` (Legal text)
*   `/support` (FAQ & Contact form)

---

## 5. 🚀 Action Plan: Where to Start?

1.  **Gather Assets:** Create a folder named `website-assets` and collect the items in Section 2.
2.  **Initialize Project:**
    ```bash
    npx create-next-app@latest timer-app-web
    ```
3.  **Design First:** Sketch the layout on paper or Figma/Canva.
4.  **Develop:** Build the components (Hero, FeatureCard, Footer).
5.  **Deploy:** Push to GitHub and connect to Vercel.

---

## 💡 Note on "Web Version" of the App
Since you already have `react-native-web` installed in your app (`package.json`), you can theoretically expose the **actual app functionality** on the web.
*   **Pros:** Users can use the timer on their laptops.
*   **Cons:** Requires ensuring all native modules (Haptics, Notifications, KeepAwake) have web fallbacks or are disabled on web.

---

## 6. 🤖 Prompt for AI Generators (e.g., Stitch, v0, Bolt)

Use the following highly detailed prompt to generate a 3D, immersive, and feature-complete landing page.

### **Copy & Paste Prompt:**

> **Goal:** Build a **high-performance, 3D-immersive landing page** for "Chronoscape" — a premium productivity app that combines a horizontal timeline ("Live Mode") with a deep focus timer.
>
> **Core Tech Stack:**
> *   **Framework**: React + Next.js.
> *   **Styling**: Tailwind CSS.
> *   **3D/Animations**: Three.js (react-three-fiber) OR Spline for 3D elements. Framer Motion for UI transitions.
>
> **Design Language (The "Chronoscape" Aesthetic):**
> *   **Vibe**: Futuristic, Professional, "Flow State".
> *   **Background**: Deep void black (`#050505`) with subtle, moving neon aurora gradients (Cyan/Purple) in the deep distance.
> *   **Glassmorphism 2.0**: UI elements are not just flat glass; they have **depth, refraction, and specular highlights**.
> *   **Neon Accents**:
>     *   **Cyan (`#00E5FF`)**: Primary active state (Timer, NOW line).
>     *   **Signal Green (`#00E676`)**: Success/Completion.
>     *   **Fire Orange (`#FF9100`)**: Streaks & Process.
>     *   **Gold (`#FFD700`)**: Premium/Milestones.
>
> **Page Structure & Interactive Components:**
>
> ### 1. 🌌 Hero Section (3D Interactive)
> *   **Headline**: "TIME IS A LANDSCAPE. NAVIGATE IT."
> *   **Sub-headline**: "The first timeline-based focus tool for professionals. Switch from big-picture planning to deep-focus flow in one gesture."
> *   **Central 3D Element**:
>     *   A floating, interactive **3D iPhone 15 Pro** model.
>     *   **Screen Content**: It displays the app's **"Live Mode"** (Horizontal Timeline).
>     *   **Interaction**: As the user scrolls, the phone rotates from **Landscape** (showing the timeline) to **Portrait** (showing the generic Focus Timer), demonstrating the app's core transition.
>     *   **Surroundings**: Floating 3D glass debris or abstract clock gears hovering slowly around the phone.
>
> ### 2. ⚡ "Live Mode" Feature Showcase (The Timeline)
> *   **Visual**: A horizontal scrolling section that mimics the app's actual timeline.
> *   **Interactivity**: Users can drag a glass "Task Card" from a sidebar and drop it onto the timeline.
> *   **Key Details to Highlight**:
>     *   **"Swimlanes"**: Separate horizontal tracks for different tasks.
>     *   **The "NOW" Line**: A glowing vertical Cyan laser line that cuts through all tasks, showing the exact current time.
>     *   **Dynamic Resizing**: Show how task blocks resize when dragged (replicating the app's pinch/drag gestures).
>
> ### 3. 🎯 "Focus Mode" Deep Dive (Immersive Timer)
> *   **Style**: Minimalist, distraction-free.
> *   **Component**: A massive, full-screen digital timer (e.g., "45:00") using `Inter` Black font.
> *   **Interaction**:
>     *   **Slide-to-Complete**: A bottom slider with a glowing handle. When the web user slides it, trigger a confetti/haptic visual explosion (Gold/Green particles).
>     *   **Background Pulse**: The background should pulse slowly with the ticking seconds (breathing effect).
>
> ### 4. 🎛️ The Power User Features (Bento Grid)
> *   **Layout**: A 3D tilted Bento Grid (CSS 3D transform).
> *   **Cards**:
>     *   **Smart Recurring Tasks**: Icon of a looping arrow. Text: "Set it once. Repeats with your schedule."
>     *   **Logical Day**: Text: "Night owl? Your day starts when YOU say it does (e.g., 4 AM)."
>     *   **Quick Replies**: Pill-shaped buttons saying "STARTED", "DONE", "BLOCKER" in neon colors.
>     *   **Leave Mode**: A calendar grid showing "Red/Blocked" days. Text: "Protect your time off."
>     *   **Category Themes**: Show small swatches of the app's themes (Monochrome, Dark Knight, Neon Cyan).
>
> ### 5. 🏆 Gamification & Stats
> *   **Visual**: A floating 3D "Fire" emblem (`#FF6B35`) representing the **Streak**.
> *   **Data**: "Daily Progress" ring chart filling up as the user scrolls down.
>
> ### 6. 🦶 Footer & CTA
> *   **Main CTA**: "Enter the Chronoscape". Button should look like a glowing neon light bar.
> *   **Download Badges**: Apple App Store & Google Play (Glass/White style).
>
> **Technical Requirements for the Generator:**
> *   Ensure consistent **Z-index layering** so 3D elements don't block text.
> *   Use **Backdrop Filter: Blur(30px)** for all UI panels to ensure readability over the rich background.
> *   Fonts: `Plus Jakarta Sans` (Headings), `Inter` (UI/Body).

