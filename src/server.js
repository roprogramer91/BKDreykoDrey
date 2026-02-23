require('dotenv').config();

const express = require('express');
const cors = require('cors');

const db = require('./db');
const apiRouter = require('./routes/api');
const webhooksRouter = require('./routes/webhooks');
const adminRouter = require('./routes/admin');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(
  cors({
    origin: corsOrigin,
  })
);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', apiRouter);
app.use('/webhooks', webhooksRouter);
app.use('/admin', adminRouter);

app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err);
  res.status(500).json({ error: 'Error interno' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.initSchema();
    app.listen(PORT, () => {
      console.log(`Servidor DreykoDrey escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('[INIT] Error inicializando la base de datos', err);
    process.exit(1);
  }
}

start();

