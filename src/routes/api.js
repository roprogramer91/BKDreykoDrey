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

    const preferenceBody = {
      items: [
        {
          title: 'Apoyo DreykoDrey',
          quantity: 1,
          unit_price: unitPrice,
          currency_id: 'ARS',
        },
      ],
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

module.exports = router;

