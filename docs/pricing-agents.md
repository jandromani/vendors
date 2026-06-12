# Pricing Agents

Este proyecto ya no usa un watcher heurístico simple. Ahora ejecuta tres capas coordinadas:

1. `News Watch Graph`
   - Busca noticias, changelogs y señales recientes de pricing.
   - Propone operaciones estructuradas sobre un catálogo cerrado.

2. `Truth Graph`
   - Convierte la web en claims verificables.
   - Relee fuentes oficiales permitidas.
   - Decide claim por claim si el valor sigue confirmado, necesita revisión o puede autopublicarse.

3. `Runtime Autopilot`
   - Ingiere telemetría real desde fuentes whitelisteadas.
   - Recalibra assumptions medibles con guardarraíles duros.
   - Bloquea la edición manual cuando la gobernanza autónoma está activa.

La web solo cambia cuando estas capas dejan evidencia suficiente y la gobernanza lo permite.

## Arquitectura

1. `Orchestrator`
   - Ejecuta los agentes en secuencia.
   - Obliga a cada agente a responder solo con `tool_call` o `final`.
   - Valida cada salida con esquema antes de continuar.

2. `ScoutAgent`
   - Herramientas:
     - `read_watch_state`
     - `list_sources`
     - `read_source`
     - `search_google_news`
   - Objetivo:
     - Encontrar candidatos recientes relacionados con pricing/billing.

3. `ResearchAgent`
   - Herramientas:
     - `read_article`
     - `extract_alias_windows`
     - `extract_money_mentions`
     - `get_catalog`
   - Objetivo:
     - Abrir artículos y extraer evidencia dura.

4. `MappingAgent`
   - Herramientas:
     - `get_catalog`
     - `get_current_snapshot`
   - Objetivo:
     - Convertir evidencia en operaciones de actualización seguras.

5. `AuditAgent`
   - Herramientas:
     - `get_catalog`
     - `get_current_snapshot`
   - Objetivo:
     - Aprobar solo operaciones suficientemente justificadas.
     - Exigir par completo `input/output` antes de aprobar cambios de precio de modelo.

6. `Updater`
   - No es creativo.
   - Aplica de forma determinista las operaciones aprobadas a `data/pricing-overrides.json`.

## Truth Graph

La capa de verificación de verdad vive sobre la foto fija ya resuelta (`base vendors + overrides`) y trata cada precio de la web como un `claim`.

### Grafo

1. `ClaimExtractor`
   - Rompe la web en claims del tipo:
     - `vendorId`
     - `targetType`
     - `targetName`
     - `field`
     - `currentValue`

2. `TruthSourceResolver`
   - Resuelve, para cada claim, una whitelist de fuentes oficiales desde `data/pricing-truth-registry.json`.
   - Un claim nunca decide libremente dónde mirar.

3. `EvidenceCollector`
   - Hace fetch de las fuentes oficiales permitidas.
   - Extrae ventanas por alias y menciones monetarias.

4. `DatumJudgeAgent`
   - Juzga un claim cada vez.
   - Solo puede cerrar en:
     - `confirmed`
     - `update_required`
     - `stale_review_needed`
     - `conflict_hold`
     - `unverifiable`

5. `PublicationGate`
   - Convierte solo los verdicts seguros en operaciones publicables.
   - Para modelos exige par `input/output` en la misma ejecución.

6. `Safe Updater`
   - Aplica únicamente operaciones whitelisteadas sobre `data/pricing-overrides.json`.

### Source of Truth

El source of truth no es un agente libre. Es un registro declarativo:

- `data/pricing-truth-registry.json`

Ahí se define:

- qué URLs son oficiales,
- qué claims puede verificar cada vendor,
- qué targets son `manual_only`,
- qué claims son `autoPatch`,
- y qué umbrales duros usa el sistema.

### Dónde vive

- `scripts/agentic/pricing-truth-orchestrator.mjs`: motor del truth graph
- `data/pricing-truth-registry.json`: fuentes oficiales y políticas
- `data/pricing-vendors.json`: foto fija base compartida con la web
- `data/pricing-truth-state.json`: resumen operativo del último ciclo de verdad
- `data/pricing-truth-last-run.json`: dossier completo del último ciclo
- `data/pricing-truth-runs.json`: histórico completo de runs del truth graph

## Runtime Autopilot

La tercera capa convierte la telemetría operativa del piloto en señales medibles para escenarios, roles y assumptions.

### Qué hace

1. `Source Registry`
   - Lee únicamente conectores declarados en `data/pricing-runtime-sources.json`.
   - Hoy soporta `csv_file`, `json_file` y `http_json`.

2. `Runtime Autopilot`
   - Ingiere filas crudas.
   - Normaliza cada muestra a un contrato cerrado.
   - Deduplica por `source id`.
   - Calcula overrides medidos solo si los guardarraíles de gobernanza se cumplen.

3. `Governance Gate`
   - Vive en `data/pricing-runtime-governance.json`.
   - Define si el modo autónomo está activo.
   - Define si los edits manuales quedan bloqueados.
   - Define umbrales de confianza, mínimos de muestra y assumptions permitidos.

4. `Runtime State`
   - Persiste el último estado operativo en `data/pricing-runtime-state.json`.
   - Persiste el último dossier en `data/pricing-runtime-last-run.json`.
   - Persiste histórico en `data/pricing-runtime-runs.json`.

### Guardarraíles del runtime

- Ninguna fuente de telemetría puede entrar si no está en el source registry.
- Ningún assumption puede ser sobreescrito si no está en `allowedAssumptionOverrideIds`.
- Ningún override medido se aplica sin mínimos de muestra, confianza y requests ponderados.
- Cuando `autonomousMode=true` y `manualEditsLocked=true`, la API interna responde `423` y `/internal/lab` queda en solo lectura.
- El usuario sigue pudiendo ver el estado del runtime, pero no editarlo desde la app.

## Guardarraíles

- Cada agente solo puede devolver un JSON con esta forma:
  - `decision`
  - `rationale`
  - `toolName`
  - `toolInput`
  - `finalPayload`
- Máximo una llamada a herramienta por turno.
- Si la salida no pasa el esquema, el orquestador la rechaza.
- Ningún agente puede usar herramientas fuera de su lista blanca.
- Ningún agente puede proponer targets fuera del catálogo en `data/pricing-agent-catalog.json`.
- Ningún agente puede introducir campos no permitidos.
- Ningún cambio se aplica si:
  - el target no existe en catálogo,
  - el campo no está permitido,
  - el valor no aparece en la evidencia numérica,
  - la confianza es inferior al umbral duro,
  - un cambio de modelo no trae juntos `inputPricePerMTok` y `outputPricePerMTok`,
  - el auditor no lo aprueba.
- Ningún claim del truth graph puede consultar una fuente fuera del `truth registry`.
- Si una fuente oficial no puede probar explícitamente un valor, el sistema prefiere `stale_review_needed` o `unverifiable` antes que inventar un update.
- Si el bundle es demasiado ruidoso, el claim se cierra conservadoramente sin publicar nada.

## Fuentes

Las fuentes aprobadas viven en `data/pricing-agent-sources.json`.

- Oficiales:
  - OpenAI News RSS
  - Anthropic News
  - Anthropic API Changelog
  - Google AI Blog RSS
- Externas:
  - Google News RSS por vendor para pricing/billing/token cost

## Proveedor de modelo

Por defecto usa OpenRouter con router gratuito:

- `PRICING_AGENT_PROVIDER=openrouter`
- `PRICING_AGENT_MODEL=openrouter/free`
- `OPENROUTER_API_KEY=...`
- `PRICING_AGENT_OPENROUTER_FALLBACK_MODELS=openai/gpt-oss-120b:free,poolside/laguna-m.1:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/owl-alpha`

El router `openrouter/free` filtra por capacidades del request y puede escoger modelos `:free` compatibles con `response_format`, que es justo lo que usa este sistema para mantener el protocolo JSON y los guardarraíles de comunicación.

Tambien soporta Gemini:

- `PRICING_AGENT_PROVIDER=gemini`
- `PRICING_AGENT_MODEL=gemini-2.5-flash-lite`
- `GEMINI_API_KEY=...`

Tambien soporta OpenAI:

- `PRICING_AGENT_PROVIDER=openai`
- `PRICING_AGENT_MODEL=gpt-5.4`
- `OPENAI_API_KEY=...`

Tambien existe `mock` para pruebas del pipeline sin gastar llamadas reales.

Si falta la key del proveedor elegido y lanzas el modo real, la ejecución falla en preflight y deja igualmente:

- `pricing-agent-state.json` en `error`
- una entrada de `pricing-agent-log.json`
- un dossier de error en `pricing-agent-last-run.json`
- histórico en `pricing-agent-dossiers.json`

Esto permite inspeccionar también los fallos de configuración desde `/internal/agents`.

## Archivos clave

- `scripts/pricing-agents.mjs`: entrypoint principal.
- `scripts/agentic/pricing-orchestrator.mjs`: motor del flujo agéntico.
- `scripts/agentic/pricing-tools.mjs`: herramientas deterministas.
- `scripts/agentic/pricing-models.mjs`: clientes OpenRouter, Gemini, OpenAI y mock.
- `scripts/agentic/pricing-schemas.mjs`: contratos estrictos.
- `data/pricing-agent-sources.json`: fuentes aprobadas.
- `data/pricing-agent-catalog.json`: catálogo/whitelist de targets.
- `data/pricing-agent-last-run.json`: dossier completo del último ciclo.
- `data/pricing-agent-dossiers.json`: histórico de dossiers completos.
- `data/pricing-agent-state.json`: resumen operativo del último ciclo.
- `data/pricing-agent-log.json`: histórico resumido.
- `data/pricing-truth-registry.json`: source registry oficial por claim.
- `data/pricing-truth-state.json`: resumen del último ciclo de verificación claim-by-claim.
- `data/pricing-truth-last-run.json`: dossier completo del último ciclo del truth graph.
- `data/pricing-truth-runs.json`: histórico del truth graph.
- `data/pricing-runtime-governance.json`: gobernanza del runtime autónomo.
- `data/pricing-runtime-sources.json`: registry de fuentes medidas.
- `data/pricing-telemetry.json`: telemetría normalizada vigente.
- `data/pricing-assumption-overrides.json`: overrides medidos vigentes.
- `data/pricing-runtime-state.json`: resumen del último ciclo del runtime autopilot.
- `data/pricing-runtime-last-run.json`: dossier completo del último ciclo del runtime autopilot.
- `data/pricing-runtime-runs.json`: histórico del runtime autopilot.

## Ejecución manual

Modo real:

```bash
node scripts/pricing-agents.mjs --force
```

Este comando ejecuta ambas capas:

- watcher de noticias
- truth graph claim-by-claim

Modo simulación seguro:

```bash
node scripts/pricing-agents.mjs --dry-run --allow-mock
```

Modo mock:

```bash
node scripts/pricing-agents.mjs --force --allow-mock
```

## Variables de entorno

Hay un ejemplo en `.env.example`.

```env
PRICING_AGENT_PROVIDER=openrouter
PRICING_AGENT_MODEL=openrouter/free
OPENROUTER_API_KEY=your_openrouter_api_key_here
PRICING_AGENT_OPENROUTER_FALLBACK_MODELS=openai/gpt-oss-120b:free,poolside/laguna-m.1:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/owl-alpha
CRON_SECRET=your_vercel_cron_secret_here
GITHUB_ACTIONS_TRIGGER_TOKEN=your_github_actions_pat_here
GITHUB_ACTIONS_REPOSITORY=owner/repo
GITHUB_ACTIONS_WORKFLOW_FILE=pricing-agents.yml
GITHUB_ACTIONS_REF=main
VERCEL_TOKEN=your_vercel_access_token_here
# VERCEL_SCOPE=your-team-slug
# VERCEL_PRODUCTION_ALIASES=ai-vendor-compare.vercel.app

# o bien Gemini
# PRICING_AGENT_PROVIDER=gemini
# PRICING_AGENT_MODEL=gemini-2.5-flash-lite
# GEMINI_API_KEY=your_google_ai_studio_key_here

# o bien OpenAI
# PRICING_AGENT_PROVIDER=openai
# PRICING_AGENT_MODEL=gpt-5.4
# OPENAI_API_KEY=your_openai_api_key_here
```

## Página interna

La inspección visual de runs está en:

```text
/internal/agents
```

Ahí puedes ver cada ejecución persistida, la traza completa de `ScoutAgent`, `ResearchAgent`, `MappingAgent` y `AuditAgent`, y filtrar por `runId`, estado, vendor o agente.

Si la ejecución falló antes de arrancar el orquestador, también verás el `System Error` y el estado de readiness live.

La inspección visual del truth graph está en:

```text
/internal/truth
```

Ahí puedes ver:

- claims verificados,
- verdicts por dato,
- evidence bundle por claim,
- source health,
- publication gate,
- y si el claim se cerró en modo `deterministic`, `judge` o `fallback`.

La inspección visual del surface graph está en:

```text
/internal/surface
```

Ahí puedes ver:

- checks de naming y lineup por vendor,
- el historial de runs surface,
- snippets y detalles estructurados por comprobación,
- y filtros por `runId`, vendor, status o tipo de drift.

La inspección del runtime autónomo está en:

```text
/internal/lab
```

Cuando la gobernanza autónoma está activa, esta ruta cambia a modo observación:

- enseña assumptions y telemetría activas,
- muestra el último estado del runtime autopilot,
- lista la salud de ingesta por fuente,
- y bloquea cualquier edición manual desde la interfaz.

## Programación local en Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-pricing-task.ps1
```

## Programación diaria

La arquitectura productiva recomendada es:

1. `Vercel Cron`
   - Define dos slots UTC en `vercel.json` (`05:00` y `06:00`) para cubrir DST.
   - Llama a `GET /api/cron/pricing-agents`.

2. `Cron Route`
   - Verifica `Authorization: Bearer <CRON_SECRET>`.
   - Rechaza el slot que no corresponda a las `07:00` Europe/Madrid.
   - Dispara `workflow_dispatch` sobre GitHub Actions usando `GITHUB_ACTIONS_TRIGGER_TOKEN`.

3. `GitHub Actions`
   - Ejecuta `node scripts/pricing-agents.mjs --force`.
   - Hace `git add data`, commit y push si cambió cualquier JSON operativo.

4. `Vercel`
   - Detecta el nuevo commit y redeploya la web con la foto actualizada.
   - Si el proyecto usa staged production deployments, el mismo workflow puede promover automáticamente ese preview a producción usando `VERCEL_TOKEN`.
   - Si la URL pública depende de aliases manuales, el mismo workflow puede repuntarlas con `VERCEL_PRODUCTION_ALIASES`.

### Variables necesarias en Vercel

- `OPENROUTER_API_KEY`
- `PRICING_AGENT_PROVIDER=openrouter`
- `PRICING_AGENT_MODEL=openrouter/free`
- `PRICING_AGENT_OPENROUTER_FALLBACK_MODELS=...`
- `CRON_SECRET`
- `GITHUB_ACTIONS_TRIGGER_TOKEN`
- `GITHUB_ACTIONS_REPOSITORY`
- `GITHUB_ACTIONS_WORKFLOW_FILE=pricing-agents.yml`
- `GITHUB_ACTIONS_REF=main`

### Variables necesarias en GitHub Actions

- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY` (opcional)
- `OPENAI_API_KEY` (opcional)
- `VERCEL_TOKEN` (opcional, necesario para promoción automática a producción)
- `VERCEL_SCOPE` (opcional, solo si el token necesita scope explícito)
- `VERCEL_PRODUCTION_ALIASES` (opcional, aliases coma-separadas a repuntar tras la promoción)
