import { ImageResponse } from "next/og"

export const alt = "AI Vendor Compare 2026 — Pricing IA verificado por agentes"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Grid lines subtle bg */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Three dots badge */}
        <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#D97757",
            }}
          />
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#10A37F",
            }}
          />
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#4285F4",
            }}
          />
          <span
            style={{
              color: "#6b7280",
              fontSize: 16,
              marginLeft: 8,
              alignSelf: "center",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            AI Vendor Compare · 2026
          </span>
        </div>

        {/* Main title */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: 72,
            fontWeight: 800,
            color: "#f9fafb",
            lineHeight: 1.1,
            marginBottom: 28,
          }}
        >
          <span>Pricing IA verificado{" "}</span>
          <span style={{ color: "#6b7280" }}>por agentes</span>
        </div>

        {/* Vendor pills */}
        <div style={{ display: "flex", gap: 16, marginBottom: 48 }}>
          {[
            { name: "Claude", color: "#D97757", bg: "rgba(217,119,87,0.12)", border: "rgba(217,119,87,0.4)" },
            { name: "ChatGPT", color: "#10A37F", bg: "rgba(16,163,127,0.12)", border: "rgba(16,163,127,0.4)" },
            { name: "Gemini", color: "#4285F4", bg: "rgba(66,133,244,0.12)", border: "rgba(66,133,244,0.4)" },
          ].map((v) => (
            <div
              key={v.name}
              style={{
                padding: "10px 24px",
                borderRadius: 999,
                border: `1px solid ${v.border}`,
                background: v.bg,
                color: v.color,
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {v.name}
            </div>
          ))}
          <div
            style={{
              padding: "10px 24px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#9ca3af",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            + 10 ecosistemas
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 32 }}>
          {[
            { label: "Claims verificados", value: "33/33", color: "#10A37F" },
            { label: "Surface checks", value: "26/26", color: "#a78bfa" },
            { label: "Ciclo agéntico", value: "Diario · 07:00", color: "#38bdf8" },
            { label: "Fuentes oficiales", value: "28 registradas", color: "#f59e0b" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 14, color: "#6b7280" }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Domain bottom right */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 96,
            color: "#374151",
            fontSize: 18,
          }}
        >
          ai-vendor-compare.vercel.app
        </div>
      </div>
    ),
    { ...size }
  )
}
