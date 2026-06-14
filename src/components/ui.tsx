"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function Card({
  children,
  className = "",
  title,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className={`bg-lab-paper rounded-2xl shadow-lab-sm border border-lab-line ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          {title && <h3 className="text-lg font-semibold text-lab-navy">{title}</h3>}
          {right}
        </div>
      )}
      <div className="px-5 pb-5 pt-1">{children}</div>
    </div>
  );
}

type BtnVariant = "primary" | "ghost" | "danger" | "soft" | "navy";
export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: BtnVariant;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1 rounded-xl font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-base";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    navy: "bg-lab-navy text-white hover:bg-lab-navy-deep hover:-translate-y-px shadow-lab-sm",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function DisclosureButton({
  expanded,
  onClick,
  disabled,
  openLabel = "열기",
  closeLabel = "접기",
}: {
  expanded: boolean;
  onClick: () => void;
  disabled?: boolean;
  openLabel?: string;
  closeLabel?: string;
}) {
  return (
    <Button
      size="sm"
      variant={expanded ? "ghost" : "soft"}
      onClick={onClick}
      disabled={disabled}
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      )}
      {expanded ? closeLabel : openLabel}
    </Button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-base font-medium text-lab-navy mb-1">{label}</span>
      {children}
      {hint && <span className="block text-sm text-lab-muted mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-lab-line px-3 py-2.5 text-base focus:border-brand-600 focus:ring-2 focus:ring-brand-100 outline-none bg-white";

// 로그인 리디자인용 변형(골드 포커스 링, 종이톤). 기본값은 기존과 동일(하위호환).
const inputClsLab =
  "w-full rounded-xl border-[1.5px] border-lab-line bg-white px-3 py-3 text-[14px] text-lab-ink placeholder:text-[#b8b3a6] focus:border-lab-gold focus:outline-none focus:ring-4 focus:ring-lab-gold transition";

export function Input({
  variant = "default",
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { variant?: "default" | "lab" }) {
  const base = variant === "lab" ? inputClsLab : inputCls;
  return <input {...props} className={`${base} ${className}`} />;
}

/**
 * 한글 IME 안전 텍스트 입력.
 * 조합(composition) 중에는 내부 로컬값을 바인딩해 React가 조합을 끊지 않도록 하고,
 * 조합 종료/비조합 변경 시에만 부모(onChange)로 반영한다.
 */
export function TextInput({
  value,
  onChange,
  className,
  ...rest
}: { value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "defaultValue"
>) {
  // 언컨트롤드(ref 기반) — React가 조합(IME) 중 DOM 값을 절대 건드리지 않도록 한다.
  // 외부 value 변경은 (조합 중이 아닐 때) useEffect로만 DOM에 반영한다.
  const ref = React.useRef<HTMLInputElement>(null);
  const composing = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (el && !composing.current && el.value !== value) {
      el.value = value;
    }
  }, [value]);

  return (
    <input
      ref={ref}
      {...rest}
      defaultValue={value}
      onChange={(e) => {
        if (composing.current) return; // 조합 중: 부모 갱신 보류
        onChange(e.target.value);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        onChange((e.target as HTMLInputElement).value);
      }}
      className={`${inputCls} ${className || ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Badge({
  children,
  color = "gray",
  size = "md",
}: {
  children: React.ReactNode;
  color?: "gray" | "green" | "red" | "amber" | "indigo" | "blue";
  size?: "sm" | "md" | "lg";
}) {
  const colors: Record<string, string> = {
    gray: "bg-[#f1ede2] text-lab-muted",
    green: "bg-lab-green-soft text-lab-green",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    indigo: "bg-brand-50 text-brand-700",
    blue: "bg-[#eef1f8] text-lab-navy",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base sm:text-lg",
  };
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizes[size]} ${colors[color]}`}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`bg-lab-paper w-full ${width} rounded-t-2xl sm:rounded-2xl shadow-lab max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-lab-line sticky top-0 bg-lab-paper">
          <h3 className="font-semibold text-lab-navy">{title}</h3>
          <button onClick={onClose} className="text-lab-muted hover:text-lab-navy text-xl leading-none">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center text-base text-lab-muted py-10">{children}</div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = "gray",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "gray" | "green" | "indigo" | "amber" | "red";
}) {
  const accents: Record<string, string> = {
    gray: "text-lab-ink",
    green: "text-lab-green",
    indigo: "text-brand-700",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <div className="bg-lab-paper rounded-2xl border border-lab-line shadow-lab-sm px-4 py-3">
      <div className="text-sm text-lab-muted">{label}</div>
      <div className={`text-3xl font-bold mt-0.5 ${accents[accent]}`}>{value}</div>
      {sub && <div className="text-sm text-lab-muted mt-0.5">{sub}</div>}
    </div>
  );
}
