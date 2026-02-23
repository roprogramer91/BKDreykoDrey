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

module.exports = router;

