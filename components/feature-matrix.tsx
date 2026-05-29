"use client"

import { Fragment } from "react"

import { cn } from "@/lib/utils"
import { Check, X, Minus } from "lucide-react"

type Status = "yes" | "no" | "partial" | string

interface FeatureRow {
  category: string
  features: {
    label: string
    note?: string
    claude: Status
    chatgpt: Status
    gemini: Status
  }[]
}

const matrix: FeatureRow[] = [
  {
    category: "Modelos y capacidades",
    features: [
      { label: "Contexto máximo", claude: "200K", chatgpt: "1.05M", gemini: "1M ★" },
      { label: "Razonamiento extendido (thinking)", claude: "Parcial", chatgpt: "GPT-5.5", gemini: "2.5 Pro" },
      { label: "Multimodal (imagen + texto)", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Procesamiento de video nativo", claude: "no", chatgpt: "no", gemini: "yes" },
      { label: "Audio nativo (habla)", claude: "no", chatgpt: "yes", gemini: "yes" },
      { label: "Generación de imágenes", claude: "no", chatgpt: "gpt-image-1", gemini: "Imagen 3" },
    ],
  },
  {
    category: "API y desarrollo",
    features: [
      { label: "API REST pública", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Streaming SSE", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Function calling / Tools", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Structured output (JSON)", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Prompt caching", claude: "yes", chatgpt: "Cached input", gemini: "yes" },
      { label: "Batch API (50% descuento)", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Fine-tuning / ajuste fino", claude: "no", chatgpt: "yes", gemini: "yes" },
      { label: "Embeddings", claude: "no", chatgpt: "yes", gemini: "yes" },
      { label: "Realtime / Live API", claude: "no", chatgpt: "Realtime API", gemini: "Live API" },
    ],
  },
  {
    category: "Agentes y herramientas",
    features: [
      { label: "Búsqueda web integrada", claude: "$10/1K búsq.", chatgpt: "yes (Plus)", gemini: "$35/1K búsq." },
      { label: "Ejecución de código", claude: "yes", chatgpt: "yes", gemini: "yes" },
      { label: "Managed Agents / runtime", claude: "$0.08/h", chatgpt: "Responses + Agents SDK", gemini: "Agent Builder" },
      { label: "Computer use (UI automation)", claude: "yes", chatgpt: "Partial", gemini: "no" },
      { label: "MCP (Model Context Protocol)", claude: "yes", chatgpt: "Partial", gemini: "no" },
    ],
  },
  {
    category: "Planes empresariales",
    features: [
      { label: "Plan Team disponible", claude: "yes", chatgpt: "yes", gemini: "Workspace" },
      { label: "SSO / SAML", claude: "Enterprise", chatgpt: "Enterprise", gemini: "Workspace" },
      { label: "Spend limits / controls", claude: "Enterprise", chatgpt: "yes", gemini: "Vertex AI" },
      { label: "VPC / datos privados", claude: "Enterprise", chatgpt: "Enterprise", gemini: "Vertex AI" },
      { label: "On-premise / self-hosted", claude: "no", chatgpt: "no", gemini: "Vertex AI" },
      { label: "Integración con suite ofimática", claude: "no", chatgpt: "Microsoft 365", gemini: "Google Workspace" },
    ],
  },
  {
    category: "Precios y optimización",
    features: [
      { label: "Modelo gratuito en API", claude: "no", chatgpt: "no", gemini: "Flash (límites)" },
      { label: "Descuento batch", claude: "−50%", chatgpt: "−50%", gemini: "−50%" },
      { label: "Descuento caché (cache hits)", claude: "−90%", chatgpt: "−50%", gemini: "−75%" },
      { label: "Precio input tier rápido ($/MTok)", claude: "$1.00", chatgpt: "$0.75", gemini: "$0.10" },
      { label: "Precio output tier rápido ($/MTok)", claude: "$5.00", chatgpt: "$4.50", gemini: "$0.40" },
      { label: "Compromisos de uso (descuento vol.)", claude: "Negociado", chatgpt: "Negociado", gemini: "Vertex CUD" },
    ],
  },
]

const vendorColors: Record<string, string> = {
  claude: "text-orange-400",
  chatgpt: "text-emerald-400",
  gemini: "text-blue-400",
}

function StatusCell({ value, vendorId }: { value: Status; vendorId: string }) {
  if (value === "yes") return (
    <div className="flex justify-center">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="w-3.5 h-3.5" />
      </span>
    </div>
  )
  if (value === "no") return (
    <div className="flex justify-center">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted/40 text-muted-foreground/50">
        <X className="w-3.5 h-3.5" />
      </span>
    </div>
  )
  if (value === "partial" || value === "Partial") return (
    <div className="flex justify-center">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-400">
        <Minus className="w-3.5 h-3.5" />
      </span>
    </div>
  )
  return (
    <div className="flex justify-center">
      <span className={cn("text-xs font-medium px-2 py-0.5 rounded bg-muted/30 text-foreground text-center leading-tight", vendorColors[vendorId])}>
        {value}
      </span>
    </div>
  )
}

export function FeatureMatrix() {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="font-semibold text-lg text-foreground">Matriz de capacidades</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Comparativa completa de funciones y características — Mayo 2026</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-64">Característica</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-orange-400 w-36">Claude</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-emerald-400 w-36">ChatGPT</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide text-blue-400 w-36">Gemini</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ category, features }) => (
                <Fragment key={`group-${category}`}>
                  <tr className="bg-muted/10 border-b border-t border-border/40">
                    <td colSpan={4} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {category}
                    </td>
                  </tr>
                  {features.map((f, i) => (
                    <tr key={`${category}-${i}`} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-3 text-sm text-muted-foreground">
                        {f.label}
                        {f.note && <span className="ml-1 text-[10px] text-muted-foreground/60">({f.note})</span>}
                      </td>
                      <td className="px-4 py-3"><StatusCell value={f.claude} vendorId="claude" /></td>
                      <td className="px-4 py-3"><StatusCell value={f.chatgpt} vendorId="chatgpt" /></td>
                      <td className="px-4 py-3"><StatusCell value={f.gemini} vendorId="gemini" /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
