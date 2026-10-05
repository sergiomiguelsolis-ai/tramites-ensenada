# Trámites Ensenada (demo no oficial)

Asistente con IA que responde, en lenguaje sencillo, qué necesitas para cualquier trámite del Ayuntamiento de Ensenada: requisitos, costo, dónde se hace, horario y teléfono.

Usa el **catálogo público oficial** de [ventanilla.ensenada.gob.mx](https://ventanilla.ensenada.gob.mx) (236 trámites) y nunca inventa datos: cada respuesta sale de la ficha oficial.

Incluye un **panel de demanda ciudadana** (`/panel`) que muestra en tiempo real qué trámites consulta la gente, junto con el estado del catálogo oficial.

## Publicarlo en Vercel

1. Importa este repositorio en [vercel.com/new](https://vercel.com/new). Framework: **Other**. No necesita comando de build.
2. En **Settings → Environment Variables** agrega `ANTHROPIC_API_KEY` con tu clave de [platform.claude.com](https://platform.claude.com).
3. Despliega. Las páginas salen de `public/` y la API de `api/`.

Opcional (recomendado cuando haya usuarios reales): en **Storage → Marketplace** conecta **Upstash Redis** al proyecto. Así las conversaciones, el registro del panel y los límites contra abuso se comparten entre todas las funciones y no se pierden. Sin Redis, todo se guarda en la memoria del servidor (suficiente para una demo).

Límites contra abuso, configurables con variables de entorno: `LIMITE_POR_HORA` (por persona, 20 por defecto) y `LIMITE_POR_DIA` (total, 300 por defecto).

## Correrlo en tu computadora

1. Copia `.env.example` como `.env` y pega tu clave en `ANTHROPIC_API_KEY=`.
2. Instala y arranca:

```bash
npm install
npm start
```

3. Abre http://localhost:3000 (asistente) y http://localhost:3000/panel (panel).

## Actualizar el catálogo

Descarga de nuevo las fichas oficiales (tarda unos 40 segundos):

```bash
npm run catalogo
```

## Cómo está organizado

- `public/`: las páginas (`index.html`, `panel.html`), estilos y scripts compartidos (`base.css`, `base.js`), logo y fotos.
- `lib/asistente.mjs`: catálogo, instrucciones de la IA (Claude Opus 5.5) y el ciclo de respuesta. La IA recibe el índice de trámites, ubica el trámite aunque la persona hable coloquial y consulta solo la ficha que necesita.
- `lib/almacen.mjs`: conversaciones, registro de preguntas y límites (Upstash Redis o memoria local).
- `lib/rutas.mjs`: las respuestas de `/api/chat`, `/api/panel` y `/api/populares`.
- `api/`: funciones de Vercel (usan `lib/`).
- `server.mjs`: servidor local (usa `lib/`).
- `scripts/actualizar-catalogo.mjs`: descarga el catálogo público y genera `data/`.
