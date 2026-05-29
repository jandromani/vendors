import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-vendor-compare.vercel.app"),
  title: {
    default: "AI Vendor Compare 2026 — Claude · ChatGPT · Gemini · 10 ecosistemas vigilados",
    template: "%s · AI Vendor Compare",
  },
  description:
    "Pricing de IA mantenido por agentes con verificación claim-by-claim contra fuentes oficiales. Compara API, asientos y TCO real entre Claude, ChatGPT, Gemini y 10 ecosistemas más (Copilot, Mistral, xAI, DeepSeek, Cohere, Perplexity, Meta, Bedrock, Azure OpenAI).",
  keywords: [
    "AI pricing", "Claude pricing", "ChatGPT pricing", "Gemini pricing",
    "GitHub Copilot pricing", "Microsoft 365 Copilot pricing", "AI TCO",
    "OpenAI pricing", "Anthropic pricing", "AWS Bedrock pricing",
  ],
  authors: [{ name: "AI Vendor Compare" }],
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "AI Vendor Compare",
    title: "AI Vendor Compare 2026 — pricing IA verificado por agentes",
    description:
      "13 ecosistemas de IA con verificación claim-by-claim diaria, TCO real y runtime medido.",
    url: "https://ai-vendor-compare.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Vendor Compare 2026",
    description: "Pricing IA verificado diariamente por agentes.",
  },
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
