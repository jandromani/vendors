# AI Vendor Compare

Página de referencia de pricing de IA mantenida por un equipo de agentes (News Watch + Truth Graph + Surface Graph + Runtime Autopilot) con OpenRouter free como motor por defecto y failover automático a Gemini / OpenAI / mock.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- Tailwind 4 + shadcn/ui
- Agentes en Node 20, sin SDKs propietarios (fetch directo a OpenRouter / Gemini / OpenAI)
- Estado persistido como JSON versionado en `data/`

## Vendors cubiertos

**Core** (entran en TCO / cost calculator):

- Claude (Anthropic)
- ChatGPT (OpenAI)
- Gemini (Google)

**Tracked** (lineup vigilado, no entran en cost calculator):

- GitHub Copilot, Microsoft 365 Copilot
- Mistral, xAI Grok, DeepSeek, Cohere, Perplexity, Meta Llama API
- AWS Bedrock, Azure OpenAI Service

## Variables de entorno

Copia [.env.example](.env.example) a `.env.local`:

```env
PRICING_AGENT_PROVIDER=openrouter
PRICING_AGENT_MODEL=openrouter/free
OPENROUTER_API_KEY=sk-or-v1-...
PRICING_AGENT_OPENROUTER_FALLBACK_MODELS=openai/gpt-oss-120b:free,poolside/laguna-m.1:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/owl-alpha
```

`.env.local` está en `.gitignore` — **nunca** pegues la API key en commits, issues o chat.

## Desarrollo local

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # build producción
```

## Ciclo agéntico

```bash
pnpm pricing:agents          # ciclo real (requiere API key)
pnpm pricing:agents:mock     # ciclo sin red, modo degradado
pnpm pricing:agents:dry      # dry-run + mock
```

Ver detalle en [docs/pricing-agents.md](docs/pricing-agents.md).

## Deploy a Vercel

1. Push del repo a GitHub.
2. En Vercel → New Project → import del repo.
3. Framework: **Next.js** (autodetectado por [vercel.json](vercel.json)).
4. Environment Variables → añadir como mínimo:
   - `OPENROUTER_API_KEY`
   - `PRICING_AGENT_PROVIDER=openrouter`
   - `PRICING_AGENT_MODEL=openrouter/free`
   - `CRON_SECRET`
   - `GITHUB_ACTIONS_TRIGGER_TOKEN`
   - `GITHUB_ACTIONS_REPOSITORY=owner/repo`
   - (opcional) `GEMINI_API_KEY`, `OPENAI_API_KEY`
5. Deploy.

> **Nota importante**: la web en Vercel solo *lee* los JSON de `data/`. El scheduler productivo ahora vive en Vercel Cron (`/api/cron/pricing-agents`) y dispara `workflow_dispatch` sobre GitHub Actions (`.github/workflows/pricing-agents.yml`). GitHub ejecuta los agentes, hace commit & push sobre `data/`, y Vercel redeploya automáticamente.
>
> Si tu proyecto Vercel deja los deployments en preview aunque lleguen desde `main`, añade `VERCEL_TOKEN` a GitHub Actions: el workflow ya queda preparado para detectar el nuevo preview y promoverlo a la alias pública sin entrar al dashboard.

### Secrets requeridos en Vercel

En `Project Settings → Environment Variables`:

- `OPENROUTER_API_KEY`
- `PRICING_AGENT_PROVIDER=openrouter`
- `PRICING_AGENT_MODEL=openrouter/free`
- `PRICING_AGENT_OPENROUTER_FALLBACK_MODELS=openai/gpt-oss-120b:free,poolside/laguna-m.1:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/owl-alpha`
- `CRON_SECRET`
- `GITHUB_ACTIONS_TRIGGER_TOKEN`
- `GITHUB_ACTIONS_REPOSITORY`
- `GITHUB_ACTIONS_WORKFLOW_FILE=pricing-agents.yml`
- `GITHUB_ACTIONS_REF=main`

### Secrets requeridos en GitHub Actions

En `Settings → Secrets and variables → Actions`:

- `OPENROUTER_API_KEY` (obligatorio)
- `GEMINI_API_KEY` (opcional, failover)
- `OPENAI_API_KEY` (opcional, failover)
- `VERCEL_TOKEN` (opcional, pero necesario si quieres promoción automática del preview a producción)
- `VERCEL_SCOPE` como variable de Actions (opcional, solo si el token trabaja sobre varios scopes/teams)

## Seguridad

- Las claves viven solo en `.env.local` (gitignored) y en los secrets de Vercel / GitHub.
- Si una clave queda expuesta (chat, log, screenshot), revócala inmediatamente en el panel del proveedor.
- Las rutas `/internal/*` y `/api/internal/*` no deberían exponerse a producción sin auth si quieres ocultar el lab; puedes proteger con Vercel Authentication.
- La ruta `/api/cron/pricing-agents` acepta `GET` de Vercel Cron y `POST` manual, siempre protegida por `Authorization: Bearer <CRON_SECRET>`.
