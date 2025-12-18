import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import bodyParser from 'body-parser';

import { tvAPI } from './tvInstance';
import apiRoutes from './routes/api';
import adminRoutes from './routes/admin';
import { authService } from './services/AuthService';

import { configService } from './services/ConfigService';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for now, controlled by API Key logic later if needed
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Routes
app.use('/api/v1', apiRoutes);
app.use('/admin', adminRoutes);

app.get('/docs', (_req, res) => {
  res.render('docs', { serverUrl: configService.get().serverUrl });
});

app.get('/openapi.json', (_req, res) => {
  const config = configService.get();
  res.json({
    openapi: '3.0.0',
    servers: [
      { url: config.serverUrl }
    ],
    info: {
      title: 'Market Data API',
      version: '1.0.0',
      description: 'Real-time and Snapshot Market Data API'
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'query',
          name: 'apikey'
        }
      }
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/api/v1/quote': {
        get: {
          summary: 'Get Market Quote (OHLC)',
          parameters: [
            {
              name: 'symbol',
              in: 'query',
              required: true,
              schema: { type: 'string', example: 'BINANCE:BTCUSDT' }
            },
            {
              name: 'timeframe',
              in: 'query',
              schema: { type: 'string', default: '1D' },
              description: 'Timeframe for the data. Examples: 1D, 1m, 5m, 15m, 1h, 4h, 1W, 1M.'
            }
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      symbol: { type: 'string' },
                      data: {
                        type: 'object',
                        properties: {
                          price: { type: 'number' },
                          open: { type: 'number' },
                          high: { type: 'number' },
                          low: { type: 'number' },
                          change: { type: 'number' },
                          change_percent: { type: 'number' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
});

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.token || socket.handshake.query.apikey;
  const origin = socket.handshake.headers.origin || socket.handshake.headers.referer;

  if (!apiKey) {
    return next(new Error('Authentication error: API Key required'));
  }

  const validation = authService.validateKey(apiKey as string, origin);
  if (!validation.valid) {
    return next(new Error(`Authentication error: ${validation.error}`));
  }

  // Store user info in socket
  (socket as any).apiKey = apiKey;
  next();
});

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('subscribe', async (symbol: string) => {
    if (!symbol) return;
    console.log(`Client ${socket.id} subscribing to ${symbol}`);
    
    try {
      const ticker = await tvAPI.getTicker(symbol);
      
      // Helper to format data
      const formatData = (raw: any) => ({
        price: raw.lp,
        change: raw.ch,
        change_percent: raw.chp,
        open: raw.open_price,
        high: raw.high_price,
        low: raw.low_price,
        prev_close: raw.prev_close_price,
        volume: raw.volume,
        status: raw.status,
        exchange: raw.exchange,
        type: raw.type,
        timestamp: Date.now()
      });

      // Send initial data
      const data = await ticker.fetch();
      socket.emit('price', { symbol, data: formatData(data) });

      // Listen for updates
      const onUpdate = (data: any) => {
        socket.emit('price', { symbol, data: formatData(data) });
      };

      ticker.on('update', onUpdate);

      // Cleanup on disconnect or unsubscribe
      socket.on('disconnect', () => {
        ticker.removeListener('update', onUpdate);
      });
      
      socket.on('unsubscribe', (s) => {
        if (s === symbol) {
          ticker.removeListener('update', onUpdate);
        }
      });

    } catch (e) {
      socket.emit('error', { message: `Failed to subscribe to ${symbol}` });
    }
  });
});

// Start Server
(async () => {
  console.log('Connecting to TradingView...');
  await tvAPI.setup();
  
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin (User: admin, Pass: admin)`);
    console.log(`Docs: http://localhost:${PORT}/docs`);
  });
})();
