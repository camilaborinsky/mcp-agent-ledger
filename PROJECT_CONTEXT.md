# Contexto del proyecto — MCP Agent Ledger

Documento para pasar a otra tool/agente y pedir mejoras de interactividad sin duplicar trabajo. Incluye resumen del proyecto, qué ya está hecho y patrones a seguir.

---

## Qué es el proyecto

**mcp-agent-ledger** es un servidor MCP (Model Context Protocol) hecho con **mcp-use** que expone un ledger de gastos y balances por agente. Tiene tres tools y un **widget de dashboard** que se muestra cuando el usuario (o el AI) llama a `getExpenses` o `getBalance`. El backend puede ser mock, Puzzle (Supabase/Postgres) o Manufact según `LEDGER_PROVIDER`.

- **Stack**: Node/TypeScript, mcp-use (Hono), React para el widget, Zod, Tailwind/CSS variables.
- **Entrada**: `index.ts` (server + tools), widget en `resources/agent-ledger-dashboard/`.
- **Skills de referencia**: `.cursor/skills/mcp-apps-builder/` — leer antes de tocar tools/widgets (patrones, seguridad, interactividad).

---

## Tools

| Tool           | Descripción                         | UI                    |
|----------------|-------------------------------------|------------------------|
| `getExpenses`  | Gastos por rango de fechas/agente   | Renderiza el widget    |
| `getBalance`   | Balances por agente/rango           | Renderiza el mismo widget |
| `trackExpense` | Registrar un gasto (agentId, category, vendor, description, amountMinor, etc.) | Solo JSON, sin widget |

El widget se llama **agent-ledger-dashboard** y recibe props construidos en `index.ts` con `buildWidgetProps()`: `activeTool`, `provider`, `filters`, `expenses`, `expenseSummary`, `balances`, `balanceTotals`, `asOf`. Tipado en `resources/agent-ledger-dashboard/types.ts`.

---

## Interactividad ya implementada en el dashboard (no duplicar)

El widget ya tiene:

- **Tabs**: Overview, By agent, By category (resúmenes por agente y por categoría).
- **Filtros y ordenación (estado local)**: búsqueda por vendor/descripción, filtro por categoría, filtro por agente, ordenación de gastos (fecha, monto, vendor).
- **Paginación**: tabla de gastos 10 por página con Previous/Next.
- **Formulario “Track new expense”**: sección colapsable que llama a `useCallTool("trackExpense")` con agentId, category, vendor, description, amount (en unidades principales; se convierte a minor). Mensaje de éxito y sugerencia de pedir al AI que refresque.
- **Acciones “Ask AI”** con `sendFollowUpMessage`: “Ask AI to summarize” y “Ask AI to refresh data” (para que el modelo vuelva a llamar getExpenses/getBalance).

Patrones usados: estado de UI en el widget (`useState`), mutaciones con `useCallTool("trackExpense")`, y conversación con el AI mediante `sendFollowUpMessage`. No hay tools extra para filtros/ordenación (eso es estado del widget).

---

## Cómo mejorar interactividad (qué pedirle a la otra tool)

Objetivo: **mejorar la interactividad** de una tool concreta (o del mismo dashboard) sin reimplementar lo anterior. Ejemplos de pedidos que podés hacer:

- “Quiero mejorar la interactividad de **esta tool** [nombre]. Tené en cuenta el contexto en PROJECT_CONTEXT.md: proyecto mcp-agent-ledger, mcp-use, widget en `resources/agent-ledger-dashboard`. Lo que ya tiene el dashboard está listado en ‘Interactividad ya implementada’; no lo dupliques. Recomendá mejoras concretas (ej: más acciones con `sendFollowUpMessage`, más uso de `useCallTool`, mejor UX del form, accesibilidad, estados de carga/error).”
- Si es **otra tool** (no el dashboard): “La tool [X] hoy no tiene widget / solo devuelve JSON. Según PROJECT_CONTEXT.md, ¿qué widget o cambios de UI recomendarías para hacerla más interactiva, siguiendo los patrones de mcp-use (useCallTool, sendFollowUpMessage, estado en el widget)?”

Puntos que la otra tool puede considerar:

- Nuevas acciones de “Ask AI” (p. ej. “explicar este gasto”, “sugerir categoría”, “comparar con otro periodo”).
- Mejorar el formulario de track expense (validación en vivo, sugerencias de categoría/vendor, feedback de error más claro).
- `trackExpense` podría tener un **widget opcional** (p. ej. resumen de lo registrado + botón “Ask AI to refresh dashboard”).
- UX: loading por acción, toasts, confirmaciones antes de enviar, teclado/accesibilidad.
- Más tabs o vistas (p. ej. “Top vendors”, “Timeline”) usando los mismos datos de props.

---

## Archivos clave

- `index.ts` — definición del server, tools, `buildWidgetProps`, normalización de filtros.
- `resources/agent-ledger-dashboard/widget.tsx` — UI del dashboard (tabs, filtros, form, botones Ask AI).
- `resources/agent-ledger-dashboard/types.ts` — `propSchema` y tipo de props del widget.
- `resources/styles.css` — tema (variables CSS light/dark).
- `src/ledger/` — providers (mock, puzzle, manufact), tipos, DB.

---

## Cómo testear en dev

```bash
npm run dev
```

Abrir http://localhost:3000/inspector y probar:

- `{"name":"getExpenses","arguments":{}}`
- `{"name":"getBalance","arguments":{"agentId":"agent-atlas"}}`
- Desde el widget: tabs, filtros, “Track new expense”, “Ask AI to summarize” / “Ask AI to refresh data”.

---

## Resumen en una frase

**mcp-agent-ledger**: servidor MCP con mcp-use, 3 tools (getExpenses, getBalance, trackExpense) y un widget interactivo que ya tiene tabs, filtros, paginación, formulario de track expense vía useCallTool y botones Ask AI con sendFollowUpMessage; buscamos mejorar más la interactividad sin duplicar esto.
