import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: "linear-gradient(145deg, #111111 0%, #0d0d0d 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Subtle grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            borderRadius: 40,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* Triangle of vendor dots */}
        {/* Claude — orange top-left */}
        <div
          style={{
            position: "absolute",
            top: 50,
            left: 52,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #F0926B, #D97757)",
            boxShadow: "0 0 16px rgba(217,119,87,0.55)",
          }}
        />
        {/* ChatGPT — green top-right */}
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 52,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #1FC898, #10A37F)",
            boxShadow: "0 0 16px rgba(16,163,127,0.55)",
          }}
        />
        {/* Gemini — blue bottom-center */}
        <div
          style={{
            position: "absolute",
            bottom: 44,
            left: "50%",
            marginLeft: -16,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #6EA8FF, #4285F4)",
            boxShadow: "0 0 16px rgba(66,133,244,0.55)",
          }}
        />

        {/* Connector lines */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg
            width="180"
            height="180"
            viewBox="0 0 180 180"
          >
            <line x1="68" y1="66" x2="112" y2="66" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
            <line x1="68" y1="66" x2="90" y2="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
            <line x1="112" y1="66" x2="90" y2="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  )
}
