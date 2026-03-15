import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeKiteManager, getKiteToken } from './kiteManager';
import { startQuantEngine, getLatestQuantData, getHistoricalMetrics } from './quantEngine';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Adjust this for production security
        methods: ['GET', 'POST']
    }
});

// Endpoint for Next.js to push the kite access token to the WS Engine
app.post('/set-token', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    
    console.log('[WS Engine] Received Kite access token.');
    initializeKiteManager(token, io);
    res.json({ success: true, message: 'Token updated successfully' });
});

// Optional REST endpoint to get latest snapshot
app.get('/snapshot', (req, res) => {
    res.json(getLatestQuantData());
});

io.on('connection', (socket) => {
    console.log(`[WS Engine] Client connected: ${socket.id}`);

    // Send the full intraday history immediately so the client can draw charts
    socket.emit('history', getHistoricalMetrics());
    
    // Also send the latest snapshot
    socket.emit('update', getLatestQuantData());

    socket.on('disconnect', () => {
        console.log(`[WS Engine] Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.WS_PORT || 8080;

server.listen(PORT, () => {
    console.log(`[WS Engine] Standalone Engine running on http://localhost:${PORT}`);
    // If we already have a saved token or process.env token, we can try to start
    const token = getKiteToken();
    if (token) {
        console.log('[WS Engine] Initializing Kite Manager with existing token.');
        initializeKiteManager(token, io);
    } else {
        console.log('[WS Engine] Waiting for Kite access token via /set-token...');
    }
    
    // Start the 10-second metric aggregation loop
    startQuantEngine(io);
});
