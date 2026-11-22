/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#1d2340",
        violet: {
          50: "#f4f1ff",
          100: "#e9e3ff",
          500: "#7560e8",
          600: "#624bd8",
          700: "#513bbd",
        },
      },
    },
  },
  plugins: [],
};
