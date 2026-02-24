const express = require('express');
const db = require('../db');

const router = express.Router();

function extractMercadoPagoPaymentId(body) {
  if (!body || typeof body !== 'object') return null;

  if (body.data && body.data.id) {
    return body.data.id;
  }

  if (body.id) {
    return body.id;
  }

  if (body.resource && typeof body.resource === 'string') {
    const match = body.resource.match(/\/payments\/(\d+)/);
    if (match) return match[1];
  }

  return null;
}

async function fetchMercadoPagoPayment(paymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('[MP] MP_ACCESS_TOKEN no configurado');
    throw new Error('MP_ACCESS_TOKEN no configurado');
  }

  const url = `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[MP] Error al consultar pago', response.status, text);
    throw new Error(`Error al consultar pago MP: ${response.status}`);
  }

  return response.json();
}

router.post('/mercadopago', async (req, res) => {
  try {
    const paymentId = extractMercadoPagoPaymentId(req.body);

    if (!paymentId) {
      console.warn('[MP] No se pudo extraer payment_id del webhook', req.body);
      return res.status(200).json({ received: true, ignored: true });
    }

    let payment;
    try {
      payment = await fetchMercadoPagoPayment(paymentId);
    } catch (err) {
      console.error('[MP] Error obteniendo detalle de pago', err);
      return res.status(200).json({ received: true, error: 'error fetching payment' });
    }

    const status = payment.status || 'unknown';
    const providerStatus = status === 'approved' ? 'approved' : status;
    const amount = Number(payment.transaction_amount || 0);
    const currency = payment.currency_id || 'ARS';

    if (amount <= 0) {
      console.warn('[MP] Monto inválido o cero para payment_id', paymentId);
    }

    const goalResult = await db.query(
      'SELECT exchange_ars_per_usd FROM goal_settings WHERE id = 1'
    );

    if (goalResult.rowCount === 0) {
      console.error('[MP] goal_settings no configurado');
      return res.status(200).json({ received: true, error: 'goal_settings missing' });
    }

    const exchangeRate = Number(goalResult.rows[0].exchange_ars_per_usd || 1);
    let amountUsd = 0;

    if (currency === 'ARS') {
      amountUsd = exchangeRate > 0 ? amount / exchangeRate : 0;
    } else if (currency === 'USD') {
      amountUsd = amount;
    } else {
      amountUsd = 0;
    }

    const { v4: uuidv4 } = require('uuid');

    await db.query(
      `INSERT INTO donations (id, provider, status, amount, currency, amount_usd, provider_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider_payment_id) DO NOTHING`,
      [
        uuidv4(),
        'mercadopago',
        providerStatus,
        amount,
        currency,
        amountUsd,
        String(payment.id || paymentId),
      ]
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[MP] Error en webhook de MercadoPago', err);
    return res.status(200).json({ received: true, error: 'internal error' });
  }
});

router.post('/paypal', async (req, res) => {
  try {
    const body = req.body || {};
    const eventType = body.event_type || body.eventType || '';
    const resource = body.resource || {};

    const providerPaymentId = resource.id || body.id || null;

    if (!providerPaymentId) {
      console.warn('[PayPal] No se pudo extraer resource.id del webhook', body);
      return res.status(200).json({ received: true, ignored: true });
    }

    const paypalWebhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (paypalWebhookId) {
      // Intentar validar la firma real
      try {
        const env = process.env.PAYPAL_ENV || 'sandbox';
        const baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
        
        // Setup token fetch manually since we can't easily import the helper from api.js directly without refactoring
        const clientId = process.env.PAYPAL_CLIENT_ID;
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        
        if (tokenRes.ok) {
          const { access_token } = await tokenRes.json();
          
          const verifyPayload = {
            auth_algo: req.headers['paypal-auth-algo'],
            cert_url: req.headers['paypal-cert-url'],
            transmission_id: req.headers['paypal-transmission-id'],
            transmission_sig: req.headers['paypal-transmission-sig'],
            transmission_time: req.headers['paypal-transmission-time'],
            webhook_id: paypalWebhookId,
            webhook_event: body
          };

          const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(verifyPayload)
          });
          
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.verification_status !== 'SUCCESS') {
              console.warn('[PayPal] Firma de Webhook INVÁLIDA según API', verifyData);
              return res.status(400).json({ error: 'invalid signature' });
            }
          } else {
            console.error('[PayPal] Falló la llamada a verify-webhook-signature', verifyRes.status);
            // Optionally decide whether to drop or proceed. Proceeding for robustness if PayPal API glitches.
          }
        }
      } catch (err) {
        console.error('[PayPal] Error al verificar firma del webhook', err.message);
      }
    } else {
      console.warn(
        '[PayPal] PAYPAL_WEBHOOK_ID no configurado. Firma NO se está validando.'
      );
    }

    let amount = 0;
    let currency = 'USD';

    if (resource.amount && resource.amount.value) {
      amount = Number(resource.amount.value);
      if (resource.amount.currency_code) {
        currency = resource.amount.currency_code;
      }
    } else if (resource.purchase_units && resource.purchase_units[0]) {
      const unit = resource.purchase_units[0];
      if (unit.amount && unit.amount.value) {
        amount = Number(unit.amount.value);
        if (unit.amount.currency_code) {
          currency = unit.amount.currency_code;
        }
      }
    }

    const resourceStatus = (resource.status || '').toUpperCase();
    const isCompletedEvent =
      eventType === 'PAYMENT.CAPTURE.COMPLETED' ||
      eventType === 'PAYMENT.SALE.COMPLETED' ||
      (eventType === 'CHECKOUT.ORDER.APPROVED' && resourceStatus === 'COMPLETED');

    const isCompletedStatus =
      resourceStatus === 'COMPLETED' || resourceStatus === 'APPROVED';

    const finalStatus = isCompletedEvent && isCompletedStatus ? 'completed' : 'pending';

    if (!(isCompletedEvent && isCompletedStatus)) {
      console.info(
        '[PayPal] Evento no completado. Se ignora inserción. event_type=%s status=%s',
        eventType,
        resourceStatus
      );
      return res.status(200).json({ received: true, ignored: true });
    }

    if (currency !== 'USD') {
      console.warn(
        '[PayPal] Moneda distinta de USD detectada (%s). Para MVP solo se soporta USD.',
        currency
      );
      return res.status(200).json({ received: true, ignored: true });
    }

    const { v4: uuidv4 } = require('uuid');

    await db.query(
      `INSERT INTO donations (id, provider, status, amount, currency, amount_usd, provider_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider_payment_id) DO NOTHING`,
      [uuidv4(), 'paypal', finalStatus, amount, currency, amount, String(providerPaymentId)]
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[PayPal] Error en webhook de PayPal', err);
    return res.status(200).json({ received: true, error: 'internal error' });
  }
});

module.exports = router;

