/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "section-header": "#7dd3fc",
        "dark-panel": "#1e293b",
        "dark-bg": "#0f172a",
      },
    },
  },
  plugins: [],
};
