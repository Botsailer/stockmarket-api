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

const PORT = process.env.PORT || 4639;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Routes
app.use('/api/v1', apiRoutes);
app.use('/admin', adminRoutes);

app.get('/', (_req, res) => {
  res.redirect('/docs');
});

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
      description: `
# Overview
This API provides market data via two interfaces:
1. **REST API**: On-demand snapshots and historical OHLC candles.
2. **WebSocket API**: Real-time price streaming via Socket.IO.

---

# WebSocket API (Real-time)
**Endpoint**: \`WS ${config.serverUrl}\`

## Connection
Connect using a Socket.IO client (v4.x).
**Auth**: Provide your API Key in the \`auth\` object or query params.

\`\`\`javascript
import { io } from "socket.io-client";

const socket = io('${config.serverUrl}', {
  auth: { token: 'YOUR_API_KEY' }
});

socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('subscribe', 'BINANCE:BTCUSDT');
});

socket.on('price', (data) => {
  console.log('Price Update:', data);
});
\`\`\`

## Events

### Client -> Server

| Event | Payload | Description |
|-------|---------|-------------|
| \`subscribe\` | \`string\` | Symbol to subscribe to (e.g., "BINANCE:BTCUSDT") |
| \`unsubscribe\` | \`string\` | Symbol to unsubscribe from |

### Server -> Client

| Event | Payload | Description |
|-------|---------|-------------|
| \`price\` | \`object\` | Real-time price update |
| \`error\` | \`object\` | Error message |

## Price Payload Example
\`\`\`json
{
  "symbol": "BINANCE:BTCUSDT",
  "data": {
    "price": 86500.00,
    "change": 120.5,
    "change_percent": 0.15,
    "volume": 1024.5,
    "timestamp": 1702920000000
  }
}
\`\`\`
      `
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
        },
      },
      '/api/v1/history': {
        get: {
          summary: 'Get Historical Data (Candles)',
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
            },
            {
              name: 'count',
              in: 'query',
              schema: { type: 'integer', default: 100 },
              description: 'Number of candles to retrieve (ignored if start is provided).'
            },
            {
              name: 'start',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
              description: 'Start date for the data (e.g. 2009-02-17). Overrides count.'
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
                      timeframe: { type: 'string' },
                      count: { type: 'integer' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            timestamp: { type: 'string' },
                            open: { type: 'number' },
                            high: { type: 'number' },
                            low: { type: 'number' },
                            close: { type: 'number' },
                            volume: { type: 'number' }
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
