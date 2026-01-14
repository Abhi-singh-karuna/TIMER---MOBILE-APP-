/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#00E5FF",
        "midnight": "#000510",
        "ivory": "#FDFBF7",
      },
      fontFamily: {
        "sans": ["Plus Jakarta Sans", "SF Pro Rounded", "ui-rounded", "sans-serif"]
      }
    },
  },
  plugins: [],
}
