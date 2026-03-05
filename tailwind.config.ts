import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f8ff",
          100: "#d9ebff",
          200: "#b9d9ff",
          300: "#8bc1ff",
          400: "#56a1ff",
          500: "#2f7cff",
          600: "#1b5fed",
          700: "#164acf",
          800: "#193fa7",
          900: "#1a3a83"
        }
      }
    }
  },
  plugins: []
};

export default config;
