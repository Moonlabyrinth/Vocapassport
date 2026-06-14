const CREATOR_NAME = "Lindsay Lab";

export default function CreatorFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`flex justify-center ${className}`} aria-label="프로그램 제작자">
      <span className="font-serif text-sm tracking-[0.04em] text-lab-muted opacity-80 transition hover:opacity-100">
        Designed by. <span className="font-semibold text-lab-ink">{CREATOR_NAME}</span>
      </span>
    </footer>
  );
}
