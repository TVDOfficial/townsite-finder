import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon for iPhone/iPad, drawn from the same mark as the favicon.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #14b884, #0b6f8a)" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <circle cx="49" cy="15" r="5.5" fill="#fcd34d" />
          <path d="M8 50c8-4 16-5 24-5s16 1 24 5v14H8z" fill="#0a5c6e" opacity=".55" />
          <path d="M32 9c-9.6 0-17 7.4-17 16.6C15 38 32 54 32 54s17-16 17-28.4C49 16.4 41.6 9 32 9z" fill="#fff" />
          <path d="M23.5 27.5 32 20l8.5 7.5" fill="none" stroke="#0f9f6e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M26 26.5v8.5h12v-8.5" fill="#0f9f6e" />
          <rect x="30.2" y="29.5" width="3.6" height="5.5" rx=".8" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
