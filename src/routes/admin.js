const express = require('express');
const db = require('../db');

const router = express.Router();

router.patch('/goal', async (req, res) => {
  try {
    const adminTokenHeader = req.headers['x-admin-token'];
    const expectedToken = process.env.ADMIN_TOKEN;

    if (!expectedToken) {
      console.error('[ADMIN] ADMIN_TOKEN no está configurado en el entorno');
      return res.status(500).json({ error: 'ADMIN_TOKEN no configurado' });
    }

    if (!adminTokenHeader || adminTokenHeader !== expectedToken) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { goalUsd, exchangeArsPerUsd } = req.body || {};

    const hasGoal = typeof goalUsd === 'number';
    const hasRate = typeof exchangeArsPerUsd === 'number';

    if (!hasGoal && !hasRate) {
      return res
        .status(400)
        .json({ error: 'Debe enviar al menos goalUsd o exchangeArsPerUsd' });
    }

    const result = await db.query(
      `UPDATE goal_settings
       SET goal_usd = COALESCE($1, goal_usd),
           exchange_ars_per_usd = COALESCE($2, exchange_ars_per_usd),
           updated_at = NOW()
       WHERE id = 1
       RETURNING id, goal_usd, exchange_ars_per_usd, updated_at`,
      [hasGoal ? goalUsd : null, hasRate ? exchangeArsPerUsd : null]
    );

    if (result.rowCount === 0) {
      return res.status(500).json({ error: 'No se encontró configuración de meta' });
    }

    const row = result.rows[0];

    return res.json({
      id: row.id,
      goalUsd: Number(row.goal_usd),
      exchangeArsPerUsd: Number(row.exchange_ars_per_usd),
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[ADMIN] Error en PATCH /admin/goal', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;

