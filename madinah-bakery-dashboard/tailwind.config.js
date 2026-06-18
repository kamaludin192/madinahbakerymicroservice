/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#006b3f',    // Deep Forest Green
          secondary: '#40b04f',  // Fresh Leaf Green
          accent: '#d97706',     // Wheat Gold / Croissant Amber
          darkbg: '#04170e',     // Dark green-tinted charcoal
          lightbg: '#fcfbfa',    // Soft warm cream
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
