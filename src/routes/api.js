const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/goal', async (req, res) => {
  try {
    const [goalResult, donationsResult] = await Promise.all([
      db.query(
        'SELECT goal_usd, exchange_ars_per_usd, updated_at FROM goal_settings WHERE id = 1'
      ),
      db.query(
        "SELECT COALESCE(SUM(amount_usd), 0) AS current_usd, COUNT(*) AS donors_count FROM donations WHERE status IN ('approved', 'completed')"
      ),
    ]);

    if (goalResult.rowCount === 0) {
      return res.status(500).json({ error: 'Configuración de meta no encontrada' });
    }

    const goalRow = goalResult.rows[0];
    const donationsRow = donationsResult.rows[0];

    const goalUsd = Number(goalRow.goal_usd || 0);
    const currentUsd = Number(donationsRow.current_usd || 0);
    const donorsCount = Number(donationsRow.donors_count || 0);

    const progressPct = goalUsd > 0 ? Number(((currentUsd / goalUsd) * 100).toFixed(2)) : 0;

    return res.json({
      goalUsd,
      currentUsd,
      progressPct,
      donorsCount,
      updatedAt: goalRow.updated_at,
    });
  } catch (err) {
    console.error('[API] Error en GET /api/goal', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

let cachedUsdArsRate = null;
let lastUdsArsFetch = 0;
const CACHE_TTL_MS = 60000;

async function getUsdArsRate() {
  const csvUrl = process.env.USD_ARS_CSV_URL;
  if (!csvUrl) {
    throw new Error('USD_ARS_CSV_URL no configurado en entorno');
  }

  const now = Date.now();
  if (cachedUsdArsRate !== null && (now - lastUdsArsFetch < CACHE_TTL_MS)) {
    return {
      rate: cachedUsdArsRate,
      cached: true,
      fetchedAt: new Date(lastUdsArsFetch).toISOString()
    };
  }

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Error HTTP al leer CSV: ${response.status}`);
  }

  const text = await response.text();
  const rawValue = text.split('\n')[0].split(',')[0].trim();
  const numericValue = Number(rawValue.replace(',', '.'));

  if (Number.isNaN(numericValue) || numericValue <= 0) {
    throw new Error('Error al parsear el valor numérico del CSV');
  }

  cachedUsdArsRate = numericValue;
  lastUdsArsFetch = now;

  return {
    rate: cachedUsdArsRate,
    cached: false,
    fetchedAt: new Date(lastUdsArsFetch).toISOString()
  };
}

router.get('/rates/usd-ars', async (req, res) => {
  try {
    const data = await getUsdArsRate();
    return res.json({
      usd_ars: data.rate,
      cached: data.cached,
      fetchedAt: data.fetchedAt
    });
  } catch (err) {
    console.error('[RATES] Error obteniendo tasa USD-ARS:', err.message);
    if (err.message.includes('no configurado')) {
      return res.status(500).json({ error: 'Configuración faltante' });
    }
    return res.status(502).json({ error: 'No se pudo obtener la tasa' });
  }
});

router.post('/create-mp-preference', async (req, res) => {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('[API] MP_ACCESS_TOKEN no configurado');
      return res.status(500).json({ error: 'Configuración de MercadoPago faltante' });
    }

    // Permitimos amount o unit_price en el body para flexibilidad
    const rawAmount =
      typeof req.body?.unit_price !== 'undefined'
        ? req.body.unit_price
        : req.body?.amount ?? req.body?.monto;

    const unitPrice = Number(rawAmount);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return res.status(400).json({ error: 'unit_price debe ser un número mayor a 0' });
    }

    let usdRate = 1200; // default safe fallback
    try {
      const rateData = await getUsdArsRate();
      usdRate = rateData.rate;
    } catch (err) {
      console.error('[API] Falló la obtención de la tasa USD-ARS al crear preferencia, usando fallback.', err.message);
    }

    const estimatedUsd = Number((unitPrice / usdRate).toFixed(2));

    const preferenceBody = {
      items: [
        {
          title: 'Apoyo DreykoDrey',
          quantity: 1,
          unit_price: unitPrice,
          currency_id: 'ARS',
        },
      ],
      metadata: {
        amount_usd: estimatedUsd,
        currency: 'ARS',
        usd_ars_rate: usdRate
      },
      notification_url:
        'https://bkdreykodrey-production.up.railway.app/webhooks/mercadopago',
      back_urls: {
        success: 'https://tudominio.com/gracias',
        failure: 'https://tudominio.com/error',
        pending: 'https://tudominio.com/pendiente',
      },
      auto_return: 'approved',
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        '[API] Error creando preferencia MP',
        response.status,
        response.statusText,
        text
      );
      return res.status(502).json({ error: 'No se pudo crear la preferencia de pago' });
    }

    const data = await response.json();

    return res.json({
      init_point: data.init_point || data.sandbox_init_point || null,
      id: data.id || null,
    });
  } catch (err) {
    console.error('[API] Error en POST /api/create-mp-preference', err);
    return res.status(500).json({ error: 'Error interno al crear la preferencia' });
  }
});

// --- PAYPAL HELPERS ---
function getPayPalBaseUrl() {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

let paypalAccessTokenCache = null;
let paypalTokenExpiry = 0;

async function getPayPalAccessToken() {
  const now = Date.now();
  if (paypalAccessTokenCache && now < paypalTokenExpiry) {
    return paypalAccessTokenCache;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Credenciales PayPal no configuradas (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const baseUrl = getPayPalBaseUrl();

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[PAYPAL] Error obteniendo access token', text);
    throw new Error('Fallo al obtener token de PayPal');
  }

  const data = await res.json();
  paypalAccessTokenCache = data.access_token;
  // Caching just roughly 5 minutes before expiry safely
  paypalTokenExpiry = now + (data.expires_in * 1000) - (2 * 60 * 1000); 

  return paypalAccessTokenCache;
}

// --- PAYPAL ENDPOINTS ---
router.post('/paypal/create-order', async (req, res) => {
  try {
    const { amountUsd, returnUrl } = req.body;
    const amount = Number(amountUsd);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amountUsd debe ser un número mayor a 0' });
    }

    const { origin } = req.headers;
    // Fallback if origin is not present in request
    const domain = origin || 'https://tudominio.com';

    const token = await getPayPalAccessToken();
    const baseUrl = getPayPalBaseUrl();

    // Limit to 2 decimal places for PayPal requirement
    const formattedAmount = amount.toFixed(2);

    const finalReturnUrl = returnUrl || `${domain}/donar-usd.html`;
    const finalCancelUrl = returnUrl ? `${returnUrl}?cancel=1` : `${domain}/donar-usd.html?cancel=1`;

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: formattedAmount,
          },
        },
      ],
      application_context: {
        return_url: finalReturnUrl,
        cancel_url: finalCancelUrl,
      }
    };

    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[PAYPAL] Error creando order', response.status, text);
      return res.status(502).json({ error: 'No se pudo crear la order en PayPal' });
    }

    const data = await response.json();

    const approveLink = data.links.find((l) => l.rel === 'approve');
    if (!approveLink) {
      throw new Error('No se encontró link approve en PayPal response');
    }

    return res.json({ id: data.id, approveUrl: approveLink.href });

  } catch (err) {
    console.error('[PAYPAL] Error en POST /paypal/create-order:', err.message);
    return res.status(500).json({ error: 'Error interno al crear order de PayPal' });
  }
});

router.post('/paypal/capture-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId requerido' });
    }

    const token = await getPayPalAccessToken();
    const baseUrl = getPayPalBaseUrl();

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[PAYPAL] Error capturando order', response.status, text);
      return res.status(502).json({ error: 'No se pudo capturar el pago en PayPal' });
    }

    const captureData = await response.json();

    if (captureData.status === 'COMPLETED') {
      let capturedValue = 0;
      let capturedCurrency = 'USD';

      // Parse amount from captureData
      if (
        captureData.purchase_units &&
        captureData.purchase_units[0] &&
        captureData.purchase_units[0].payments &&
        captureData.purchase_units[0].payments.captures &&
        captureData.purchase_units[0].payments.captures[0] &&
        captureData.purchase_units[0].payments.captures[0].amount
      ) {
        const amtObj = captureData.purchase_units[0].payments.captures[0].amount;
        capturedValue = Number(amtObj.value);
        capturedCurrency = amtObj.currency_code;
      }

      if (capturedValue > 0 && capturedCurrency === 'USD') {
        const { v4: uuidv4 } = require('uuid');
        // Register in DB just like webhooks do
        await db.query(
          `INSERT INTO donations (id, provider, status, amount, currency, amount_usd, provider_payment_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (provider_payment_id) DO NOTHING`,
          [
            uuidv4(),
            'paypal',
            'completed',
            capturedValue,
            capturedCurrency,
            capturedValue,
            String(orderId), 
          ]
        );
        console.info(`[PAYPAL] Pago registrado post-captura: ${orderId} por ${capturedValue} USD`);
      }
    }

    return res.json(captureData);
  } catch (err) {
    console.error('[PAYPAL] Error en POST /paypal/capture-order:', err.message);
    return res.status(500).json({ error: 'Error interno al capturar pago de PayPal' });
  }
});

module.exports = router;

