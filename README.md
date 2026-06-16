# Service Health · Monitor de servicios externos

App tipo **Uptime Kuma** para vigilar la salud de Qdrant, OpenAI, Deepgram, ElevenLabs y Soniox.
Backend en **Node + TypeScript + Express**, frontend en **React + Vite**.

Distingue dos niveles de salud:

1. **Status oficial (status-feed)** — caídas globales del proveedor, vía sus status pages públicos. No requiere API key.
2. **Cuenta / billing (account)** — problemas tuyos: API key expirada (`401`), falta de pago (`402`), cuenta restringida (`403`), cuota agotada (`429`). Se detectan llamando la API real con tu key. Se activan solo si pones la key en `.env`.

## Fuentes de salud por servicio

| Servicio    | Fuente                                                       | Key |
| ----------- | ------------------------------------------------------------ | --- |
| OpenAI      | `status.openai.com/api/v2/summary.json` (Statuspage)         | No  |
| Deepgram    | `status.deepgram.com/api/v2/summary.json` (Statuspage)       | No  |
| ElevenLabs  | `status.elevenlabs.io/api/v2/summary.json` (Statuspage)      | No  |
| Soniox      | `status.soniox.com/api/v2/summary.json` (Better Uptime)      | No  |
| Qdrant      | `GET {QDRANT_URL}/healthz` (+ opcional `/cluster`)           | URL + api-key |
| *-account   | Llamada autenticada a la API real (detecta key/billing/cuota)| Sí  |

## Arranque rápido

```bash
# 1. Instalar dependencias (backend + frontend)
npm install                 # raíz (concurrently)
npm run install:all         # backend y frontend

# 2. (Opcional) configurar keys
cp .env.example .env        # rellena lo que quieras; sin esto ya funcionan los status pages

# 3. Levantar todo (backend :4000 + frontend :5173)
npm run dev
```

Abre **http://localhost:5173**. El frontend hace proxy de `/api` al backend en `:4000`.

> El `.env` se lee desde la raíz del repo. Si lo prefieres dentro de `backend/`, muévelo ahí.

## API del backend

| Método | Ruta                          | Descripción                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/health`                 | Liveness del propio monitor          |
| GET    | `/api/services`               | Estado de todos los servicios + general |
| GET    | `/api/services/:id`           | Estado de un servicio                 |
| POST   | `/api/services/:id/check`     | Forzar un re-check inmediato          |

## Cómo añadir un servicio nuevo

Edita `backend/src/config.ts` y agrega un objeto a la lista. Tipos de check disponibles
(`backend/src/checks.ts`): `statuspage`, `betteruptime`, `qdrant`, `synthetic`.

## Notas y siguientes pasos

- **Persistencia**: el estado vive en memoria (`backend/src/store.ts`). Para historial
  duradero, cambiar el `Store` por SQLite/Postgres.
- **Notificaciones**: ya hay un punto de enganche en `store.onTransition(...)`
  (ahora solo loguea a consola). Ahí se conecta Telegram / Slack / email / WhatsApp.
- **Soniox synthetic**: el endpoint autenticado por defecto (`/v1/models`) es un placeholder;
  ajústalo al recurso de lectura real de tu plan si activas `SONIOX_API_KEY`.
- **Qdrant**: `/healthz` es liveness. Para clúster distribuido pon `QDRANT_CHECK_CLUSTER=true`.
