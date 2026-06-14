const CREATOR_NAME = "LINDSAY LAB";

export default function CreatorFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`text-center text-[10.5px] tracking-[0.16em] text-[rgba(37,41,50,0.45)] ${className}`}
      aria-label="프로그램 제작자"
    >
      System by{" "}
      <b className="font-serif tracking-[0.1em] text-[rgba(37,41,50,0.7)]">{CREATOR_NAME}</b>
    </footer>
  );
}
