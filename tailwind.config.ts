import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4f46e5",
          50: "#eef2ff",
          100: "#e0e7ff",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-noto-sans-kr)",
          "Noto Sans KR",
          "Malgun Gothic",
          "맑은 고딕",
          "sans-serif",
        ],
        serif: ["var(--font-noto-serif-kr)", "Noto Serif KR", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
