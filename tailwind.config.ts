import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 브랜드 액센트를 로그인 화면과 동일한 네이비 톤으로 통일.
        // (앱 전반의 brand-* 사용처가 자동으로 네이비로 전환됨)
        brand: {
          DEFAULT: "#2f4054",
          50: "#eef1f8",
          100: "#dce3ee",
          300: "#9fb0c4",
          600: "#2f4054",
          700: "#263443",
        },
        // 로그인/보호자 리디자인 디자인 토큰 (명세서 §2). lab- 네임스페이스로 기존 색과 충돌 방지.
        lab: {
          navy: "#2f4054",
          "navy-2": "#3f566c",
          "navy-deep": "#263443",
          gold: "#a98249",
          "gold-soft": "#e8ddc8",
          paper: "#fbfaf6",
          ink: "#1f2933",
          muted: "#717986",
          line: "#e3ded3",
          green: "#6f8f78",
          "green-soft": "#eef4ef",
          page: "#eeece6", // 프레임 바깥 배경
          panel: "#ebe5d8", // 우측 로그인 패널(종이톤)
        },
      },
      boxShadow: {
        lab: "0 16px 42px -24px rgba(31,41,51,.35)",
        "lab-sm": "0 4px 16px -12px rgba(31,41,51,.25)",
        "lab-card": "0 16px 36px -26px rgba(37,41,50,.35)",
      },
      ringColor: {
        "lab-gold": "rgba(198,161,91,.13)",
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
