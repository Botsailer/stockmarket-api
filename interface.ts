import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import https from 'https';
import { TradingViewAPI } from './src/TradingViewAPI';
import { getPrototypeChain } from './utils';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const port = 3000;

// Initialize TradingView API
const tvAPI = new TradingViewAPI();
tvAPI.setup().then(() => {
    console.log('Connected to TradingView WebSocket');
    
    // Forward debug logs
    tvAPI.ws.on('debug_log', (direction, msg) => {
        // console.log(`[${direction}] ${msg}`); // Uncomment for verbose logs
        io.emit('debug_log', { direction, msg, time: new Date().toISOString() });
    });

}).catch(err => {
    console.error('Failed to connect to TradingView:', err);
});

const DEFAULT_SYMBOLS = [
    'NASDAQ:AAPL', 'NASDAQ:TSLA', 'NASDAQ:NVDA', 'NASDAQ:AMZN', 'NASDAQ:MSFT',
    'NASDAQ:GOOGL', 'NASDAQ:META', 'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'NYSE:SPY'
];

// Setup Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (_req, res) => {
    res.render('index');
});

// Proxy for TradingView Search
app.get('/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
        res.json([]);
        return;
    }

    const searchUrl = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(query)}&hl=en&exchange=&lang=en&type=`;

    const options = {
        headers: {
            'Origin': 'https://www.tradingview.com',
            'Referer': 'https://www.tradingview.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };

    https.get(searchUrl, options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                // Transform data for frontend
                const results = json.map((item: any) => ({
                    symbol: item.symbol,
                    description: item.description,
                    exchange: item.exchange,
                    type: item.type
                }));
                res.json(results);
            } catch (e) {
                res.json([]);
            }
        });
    }).on('error', (e) => {
        console.error(e);
        res.json([]);
    });
});

io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Track subscriptions for this socket to clean up later
    const subscriptions = new Map<string, { ticker: any, listener: (d: any) => void }>();

    const subscribeToSymbol = async (symbol: string) => {
        if (subscriptions.has(symbol)) return;

        try {
            await tvAPI.setup();
            const ticker = await tvAPI.getTicker(symbol);
            
            // Debugging the ticker object
            if (!ticker || typeof ticker.on !== 'function') {
                console.error(`Invalid ticker object for ${symbol}:`);
                console.error('Type of ticker:', typeof ticker);
                console.error('Is instance of EventEmitter:', ticker instanceof require('events').EventEmitter);
                console.error('Has .on:', 'on' in ticker);
                console.error('Prototype chain:', getPrototypeChain(ticker));
                console.error('Ticker keys:', Object.keys(ticker));
                return;
            }

            const listener = (data: any) => {
                socket.emit('ticker_update', { symbol, data });
            };
            
            ticker.on('update', listener);
            subscriptions.set(symbol, { ticker, listener });
        } catch (err) {
            console.error(`Failed to subscribe to ${symbol}`, err);
        }
    };

    socket.on('subscribe', (symbol) => {
        console.log(`Subscribing to ${symbol}`);
        subscribeToSymbol(symbol);
    });

    socket.on('request_top_stocks', () => {
        console.log('Client requested top stocks');
        DEFAULT_SYMBOLS.forEach(sym => subscribeToSymbol(sym));
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        subscriptions.forEach(({ ticker, listener }) => {
            ticker.removeListener('update', listener);
        });
        subscriptions.clear();
    });
});

// Start Server
httpServer.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Run with: npx ts-node interface.ts`);
});

// Handle process exit
process.on('SIGINT', async () => {
    await tvAPI.cleanup();
    process.exit();
});
