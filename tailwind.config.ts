import forms from "@tailwindcss/forms";
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        fern: "#2f6f5e",
        saffron: "#c77d1a"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23, 32, 42, 0.09)"
      }
    }
  },
  plugins: [forms]
};

export default config;
