const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[DB] DATABASE_URL no está definido. Configura tu conexión a PostgreSQL.');
}

const sslEnabled = process.env.PGSSL === 'true' || process.env.PGSSL === '1';

const pool = new Pool({
  connectionString,
  ssl: sslEnabled
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initSchema() {
  const sql = `
CREATE TABLE IF NOT EXISTS goal_settings (
    id INT PRIMARY KEY,
    goal_usd NUMERIC NOT NULL DEFAULT 100,
    exchange_ars_per_usd NUMERIC NOT NULL DEFAULT 1100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    provider_payment_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO goal_settings (id, goal_usd, exchange_ars_per_usd)
VALUES (1, 100, 1100)
ON CONFLICT (id) DO NOTHING;
`;

  await pool.query(sql);
}

module.exports = {
  pool,
  query,
  initSchema,
};

