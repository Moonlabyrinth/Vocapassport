"use client";

import { useState } from "react";

const CREATOR_NAME = "LINDSAY LAB";
const CREATOR_LOGO_SRC = "/creator-logo.png?v=20260613-clean";

export default function CreatorFooter({ className = "" }: { className?: string }) {
  const [showLogo, setShowLogo] = useState(true);

  return (
    <footer className={`flex justify-center ${className}`} aria-label="프로그램 제작자">
      <div className="inline-flex items-center justify-center px-2 py-1 opacity-75 transition hover:opacity-100">
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
