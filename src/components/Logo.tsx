import { useId } from "react";

/** Townsite mark: a map pin with a house in it, on an outback-sky tile. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b884" />
          <stop offset="1" stopColor="#0b6f8a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}bg)`} />
      <circle cx="49" cy="15" r="5.5" fill="#fcd34d" />
      <path d="M8 50c8-4 16-5 24-5s16 1 24 5v14H8z" fill="#0a5c6e" opacity=".55" />
      <path d="M32 9c-9.6 0-17 7.4-17 16.6C15 38 32 54 32 54s17-16 17-28.4C49 16.4 41.6 9 32 9z" fill="#fff" />
      <path d="M23.5 27.5 32 20l8.5 7.5" fill="none" stroke="#0f9f6e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 26.5v8.5h12v-8.5" fill="#0f9f6e" />
      <rect x="30.2" y="29.5" width="3.6" height="5.5" rx=".8" fill="#fff" />
    </svg>
  );
}

export const PORTFOLIO_URL = "https://mathewpittard.vercel.app";
export const REPO_URL = "https://github.com/TVDOfficial/townsite-finder";

/** e.g. "v1.0.0 · fd8da7d" */
export const VERSION_LABEL = `v${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"} · ${process.env.NEXT_PUBLIC_COMMIT ?? "dev"}`;
