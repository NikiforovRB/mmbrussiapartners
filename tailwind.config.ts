import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#ffffff",
          dark: "#000000",
          accent: "#2a9fff",
          hero: "#e7ebf4",
        },
        card: {
          light: "#e7ecf6",
          dark: "#ffffff",
        },
        line: "#c1cbe1",
        hairline: "#dddcdb",
        surface: {
          muted: "#f7f7f6",
        },
        accent: {
          DEFAULT: "#2a9fff",
          dark: "#0a78d8",
          ink: "#000000",
        },
        ink: {
          DEFAULT: "#0b1020",
          muted: "#5b6478",
          subtle: "#8a93a8",
        },
        success: "#16a34a",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: ["Gilroy", "system-ui", "sans-serif"],
        display: ["Gilroy", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      borderRadius: {
        btn: "10px",
        panel: "12px",
        xl: "12px",
        "2xl": "12px",
        "3xl": "12px",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "dropdown-in": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "modal-in": {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "drawer-in": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "panel-in": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "dropdown-in": "dropdown-in 0.18s ease-out both",
        "modal-in": "modal-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both",
        "drawer-in": "drawer-in 0.26s cubic-bezier(0.22, 1, 0.36, 1) both",
        "panel-in": "panel-in 0.26s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s infinite",
        float: "float 6s ease-in-out infinite",
        "gradient-pan": "gradient-pan 8s ease infinite",
        "spin-slow": "spin-slow 14s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
