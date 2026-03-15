import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import {
  forceResubscribeUniverse,
  getSavedKiteToken,
  getStockStreamSnapshot,
  initializeStockStream,
  reconnectStockStream,
} from '@/ws-engine/stockStreamEngine';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.post('/set-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required.' });
    }

    await initializeStockStream(token, io);
    return res.json({ success: true, message: 'Stock websocket token updated.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to initialize stock stream.' });
  }
});

app.get('/snapshot', (_req, res) => {
  res.json(getStockStreamSnapshot());
});

app.post('/control', async (req, res) => {
  try {
    const { action } = req.body || {};

    if (action === 'resubscribe') {
      const snapshot = await forceResubscribeUniverse();
      return res.json({ success: true, action, snapshot });
    }

    if (action === 'reconnect') {
      const snapshot = await reconnectStockStream();
      return res.json({ success: true, action, snapshot });
    }

    return res.status(400).json({ error: 'Unsupported control action.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to run stream control action.' });
  }
});

io.on('connection', (socket) => {
  socket.emit('stock-stream:update', getStockStreamSnapshot());
});

const PORT = Number(process.env.WS_PORT || 8080);

server.listen(PORT, async () => {
  console.log(`[Stock Stream] Engine running on http://localhost:${PORT}`);
  const token = getSavedKiteToken();
  if (token) {
    try {
      await initializeStockStream(token, io);
      console.log('[Stock Stream] Initialized from saved token.');
    } catch (error) {
      console.error('[Stock Stream] Failed to initialize from saved token', error);
    }
  } else {
    console.log('[Stock Stream] Waiting for token via /set-token');
  }
});
