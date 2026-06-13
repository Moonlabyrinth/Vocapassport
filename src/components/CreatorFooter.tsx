"use client";

import { useState } from "react";

const CREATOR_NAME = "LINDSAY LAB";
const CREATOR_LOGO_SRC = "/creator-logo.png?v=20260613-clean";

export default function CreatorFooter({ className = "" }: { className?: string }) {
  const [showLogo, setShowLogo] = useState(true);

  return (
    <footer className={`flex justify-center ${className}`} aria-label="프로그램 제작자">
      <div className="inline-flex items-center justify-center rounded-2xl border border-gray-100 bg-white/75 px-4 py-2.5 shadow-sm shadow-gray-200/60 opacity-80 backdrop-blur transition hover:opacity-100">
        {showLogo ? (
          <img
            src={CREATOR_LOGO_SRC}
            alt={`${CREATOR_NAME} 로고`}
            className="h-auto w-[190px] max-w-[70vw] object-contain sm:w-[230px]"
            onError={() => setShowLogo(false)}
          />
        ) : (
          <span className="font-serif text-sm font-bold tracking-[0.18em] text-gray-700">
            {CREATOR_NAME}
          </span>
        )}
      </div>
    </footer>
  );
}
