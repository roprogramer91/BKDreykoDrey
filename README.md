# Backend donaciones DreykoDrey

Backend en Node.js + Express + PostgreSQL para mostrar una barra de progreso de donaciones en tiempo real para la web **DreykoDrey**.

## Stack

- Node.js (>= 18, CommonJS)
- Express
- PostgreSQL (Railway Postgres)
- Librerías: `pg`, `dotenv`, `cors`, `uuid`

## Estructura de archivos

- `src/server.js` – Punto de entrada del servidor Express.
- `src/db.js` – Pool de conexión a PostgreSQL.
- `src/routes/api.js` – Endpoints públicos (`/api/goal`).
- `src/routes/webhooks.js` – Webhooks de MercadoPago y PayPal.
- `src/routes/admin.js` – Endpoint admin para actualizar meta y tipo de cambio.
- `sql/init.sql` – Script de inicialización de base de datos.

## Base de datos

Ejecuta `sql/init.sql` en tu base de datos Postgres (Railway u otra).

Tablas:

### `goal_settings`

- `id` (int, PK, siempre 1)
- `goal_usd` (numeric) – meta en USD (default 100)
- `exchange_ars_per_usd` (numeric) – tipo de cambio ARS por 1 USD (default 1100)
- `updated_at` (timestamptz, default now())

### `donations`

- `id` (uuid, PK)
- `provider` (text) – `'mercadopago' | 'paypal'`
- `status` (text) – `'approved' | 'completed' | 'pending' | 'failed' | otros`
- `amount` (numeric) – monto original de la donación
- `currency` (text) – `'ARS' | 'USD'`
- `amount_usd` (numeric) – monto convertido a USD
- `provider_payment_id` (text, unique) – id de pago en el proveedor
- `created_at` (timestamptz, default now())

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (no se versiona) con algo como:

```bash
PORT=3000
DATABASE_URL=postgresql://usuario:password@host:puerto/dbname

MP_ACCESS_TOKEN=tu_token_de_produccion_o_sandbox
PAYPAL_WEBHOOK_ID=tu_webhook_id_de_paypal

ADMIN_TOKEN=un_token_secreto_para_admin

# Origen permitido para CORS (ej: tu frontend)
CORS_ORIGIN=http://localhost:5173

# SSL para Railway (opcional, según tu instancia)
PGSSL=true
```

## Cómo correr en local

1. Instala dependencias:

```bash
npm install
```

2. Inicializa la base de datos ejecutando `sql/init.sql` en tu Postgres.

3. Arranca el servidor:

```bash
npm run dev
```

o:

```bash
npm start
```

El servidor escuchará por defecto en `http://localhost:3000`.

## Endpoints

### Healthcheck

- **GET** `/health`

Respuesta:

```json
{ "ok": true }
```

### GET `/api/goal`

Devuelve el estado de la meta de donaciones.

Respuesta ejemplo:

```json
{
  "goalUsd": 100,
  "currentUsd": 23.5,
  "progressPct": 23.5,
  "donorsCount": 12,
  "updatedAt": "2026-02-23T10:00:00.000Z"
}
```

- `currentUsd` = `SUM(amount_usd)` de `donations` con `status` en `('approved', 'completed')`.
- `donorsCount` = `COUNT(*)` de esas mismas donaciones.
- `updatedAt` = `goal_settings.updated_at`.

### Webhooks

#### POST `/webhooks/mercadopago`

Recibe notificaciones de MercadoPago.

Flujo:

- Extrae un `payment_id` desde el body (`data.id`, `id` o `resource` con `/payments/{id}`).
- Llama a la API de MercadoPago:
  - `GET https://api.mercadopago.com/v1/payments/{payment_id}`
  - Header `Authorization: Bearer ${MP_ACCESS_TOKEN}`
- Si el pago está aprobado (`status === 'approved'`):
  - Inserta en `donations` si no existe `provider_payment_id`.
  - `provider = 'mercadopago'`
  - `amount = transaction_amount`
  - `currency = currency_id` (normalmente `ARS`)
  - Convierte a USD usando `goal_settings.exchange_ars_per_usd`:
    - `amount_usd = amount / exchange_ars_per_usd` para ARS.
  - Si la moneda es `USD`, se usa el monto directamente.
- Siempre responde rápido con `200` (aunque haya errores internos se loguean).

#### POST `/webhooks/paypal`

Maneja eventos de PayPal (ej. `PAYMENT.CAPTURE.COMPLETED`).

Flujo MVP:

- Usa:
  - `event_type` (`body.event_type`)
  - `resource.id` como `provider_payment_id`.
  - `resource.amount.value` y `resource.amount.currency_code` (o `purchase_units[0].amount` como fallback).
- Considera pago **completed** solo si:
  - `event_type` es `PAYMENT.CAPTURE.COMPLETED` o `PAYMENT.SALE.COMPLETED`, o
  - `event_type` es `CHECKOUT.ORDER.APPROVED` y `resource.status === 'COMPLETED'`.
- Solo inserta en DB si:
  - Evento y estado son completados, y
  - La moneda es `USD`.
- Inserta:
  - `provider = 'paypal'`
  - `status = 'completed'`
  - `amount = amount`
  - `currency = 'USD'`
  - `amount_usd = amount`
  - `provider_payment_id = resource.id`
- Otros eventos se marcan como `ignored: true` y se responde `200`.

> **IMPORTANTE (TODO PayPal firma):**  
> Para este MVP **NO** se está verificando la firma criptográfica del webhook de PayPal.  
> Para producción deberías:
> - Usar `PAYPAL_WEBHOOK_ID`, `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`.
> - Verificar headers de PayPal (`PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-CERT-URL`, etc.) y el cuerpo.
> - Validar la firma contra la API de PayPal.  
> Esto se deja fuera por simplicidad, pero el endpoint ya está preparado para agregar la verificación.

### Endpoint Admin

#### PATCH `/admin/goal`

Protegido con header:

- `x-admin-token: <ADMIN_TOKEN>`

Body JSON (uno o ambos campos):

```json
{
  "goalUsd": 150,
  "exchangeArsPerUsd": 1200
}
```

Actualiza la fila `id = 1` en `goal_settings` y `updated_at = NOW()`.

Respuesta ejemplo:

```json
{
  "id": 1,
  "goalUsd": 150,
  "exchangeArsPerUsd": 1200,
  "updatedAt": "2026-02-23T10:05:00.000Z"
}
```

## Despliegue en Railway

1. Crea un nuevo proyecto en Railway y añade:
   - Un servicio **PostgreSQL**.
   - Un servicio **Node.js** con este repo.
2. Configura las variables de entorno en Railway:
   - `DATABASE_URL` (la que te da el Postgres de Railway).
   - `MP_ACCESS_TOKEN`
   - `PAYPAL_WEBHOOK_ID`
   - `ADMIN_TOKEN`
   - `CORS_ORIGIN` (ej. tu dominio de frontend).
   - `PGSSL=true` si Railway requiere SSL (habitual).
3. Ejecuta `sql/init.sql` en tu Postgres (puedes usar el panel de Railway o un cliente externo).
4. Deploy del servicio Node.js. Railway usará `npm start` por defecto.

## Configuración de Webhooks

Suponiendo que tu backend queda expuesto como:

- `https://backend-dreyko.railway.app`

### MercadoPago

Configura el webhook en el panel de MercadoPago apuntando a:

- `https://backend-dreyko.railway.app/webhooks/mercadopago`

### PayPal

En la configuración de webhooks de PayPal, usa:

- `https://backend-dreyko.railway.app/webhooks/paypal`

Selecciona los eventos relevantes, por ejemplo:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.SALE.COMPLETED`
- `CHECKOUT.ORDER.APPROVED`

## Ejemplos de requests `curl`

### Health

```bash
curl -X GET http://localhost:3000/health
```

### Obtener progreso de meta

```bash
curl -X GET http://localhost:3000/api/goal
```

### Actualizar meta (admin)

```bash
curl -X PATCH http://localhost:3000/admin/goal \
  -H "Content-Type: application/json" \
  -H "x-admin-token: TU_ADMIN_TOKEN" \
  -d '{
    "goalUsd": 200,
    "exchangeArsPerUsd": 1300
  }'
```

### Simular webhook MercadoPago (solo para pruebas)

```bash
curl -X POST http://localhost:3000/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment",
    "data": { "id": "123456789" }
  }'
```

*(El ID debe existir en el sandbox de MP y corresponder a un pago `approved`).*

### Simular webhook PayPal (solo para pruebas)

```bash
curl -X POST http://localhost:3000/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{
    "id": "WH-EXAMPLE",
    "event_type": "PAYMENT.CAPTURE.COMPLETED",
    "resource": {
      "id": "PAYPAL-CAPTURE-ID-123",
      "status": "COMPLETED",
      "amount": {
        "value": "10.00",
        "currency_code": "USD"
      }
    }
  }'
```

