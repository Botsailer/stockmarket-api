import express from 'express';
import { tvAPI } from '../tvInstance';
import { authService } from '../services/AuthService';

const router = express.Router();

// Middleware for API Key validation
router.use((req, res, next) => {
  const apiKey = req.query.apikey as string || req.headers['x-api-key'] as string;
  const origin = req.headers.origin || req.headers.referer;

  if (!apiKey) {
    res.status(401).json({ error: 'API Key required' });
    return;
  }

  const validation = authService.validateKey(apiKey, origin);
  if (!validation.valid) {
    res.status(403).json({ error: validation.error });
    return;
  }

  // Simple In-Memory Rate Limiting
  const key = apiKey;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  
  if (!global.rateLimits) global.rateLimits = {};
  if (!global.rateLimits[key]) global.rateLimits[key] = [];
  
  // Filter out old requests
  global.rateLimits[key] = global.rateLimits[key].filter((time: number) => time > now - windowMs);
  
  if (global.rateLimits[key].length >= (validation.limit || 60)) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }
  
  global.rateLimits[key].push(now);

  next();
});

// Declare global type for rate limits
declare global {
  var rateLimits: { [key: string]: number[] };
}

router.get('/quote', async (req, res) => {
  const symbol = req.query.symbol as string;
  const timeframe = req.query.timeframe as string || '1D';

  if (!symbol) {
    res.status(400).json({ error: 'Symbol is required' });
    return;
  }

  if (timeframe !== '1D' && timeframe !== 'D') {
    // Use Chart Session for non-daily timeframes
    try {
      const candle = await tvAPI.getCandle(symbol, timeframe);
      if (!candle) {
        res.status(404).json({ error: 'No data found for symbol/timeframe', symbol, timeframe });
        return;
      }
      
      res.json({
        symbol,
        timeframe,
        timestamp: new Date(candle.timestamp).toISOString(),
        data: {
          price: candle.close,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          change: candle.close - candle.open, // Approx change for the candle
          change_percent: ((candle.close - candle.open) / candle.open) * 100
        }
      });
      return;
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch chart data', details: e });
      return;
    }
  }

  try {
    const ticker = await tvAPI.getTicker(symbol);
    let data;
    try {
      data = await ticker.fetch();
    } catch (e) {
      if (e === 'Timed out.') {
        res.status(504).json({ error: 'Timeout waiting for data from TradingView', symbol });
        return;
      }
      throw e;
    }

    if (!data || !data.pro_name) {
       res.status(503).json({ error: 'Received incomplete data from source', symbol });
       return;
    }

    // Format response to be cleaner
    const response = {
      symbol: symbol,
      timeframe: timeframe,
      timestamp: new Date().toISOString(),
      data: {
        price: data.lp,
        change: data.ch,
        change_percent: data.chp,
        open: data.open_price,
        high: data.high_price,
        low: data.low_price,
        prev_close: data.prev_close_price,
        volume: data.volume,
        status: data.status,
        exchange: data.exchange,
        type: data.type
      }
    };

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch data', details: error });
  }
});

router.get('/history', async (req, res) => {
  const symbol = req.query.symbol as string;
  const timeframe = req.query.timeframe as string || '1D';
  const count = parseInt(req.query.count as string) || 100;
  const start = req.query.start as string;
  const end = req.query.end as string;

  if (!symbol) {
    res.status(400).json({ error: 'Symbol is required' });
    return;
  }

  try {
    let startDate: Date | undefined;
    if (start) {
        startDate = new Date(start);
        if (isNaN(startDate.getTime())) {
            res.status(400).json({ error: 'Invalid start date format' });
            return;
        }
        console.log(`[DEBUG] Route: start param received: ${start}, parsed: ${startDate.toISOString()}`);
    }

    let endDate: Date | undefined;
    if (end) {
        endDate = new Date(end);
        if (isNaN(endDate.getTime())) {
            res.status(400).json({ error: 'Invalid end date format' });
            return;
        }
        console.log(`[DEBUG] Route: end param received: ${end}, parsed: ${endDate.toISOString()}`);
    }

    const candles = await tvAPI.getHistory(symbol, timeframe, count, startDate, endDate);
    if (!candles) {
      res.status(404).json({ error: 'No data found for symbol/timeframe', symbol, timeframe });
      return;
    }
    
    // Filter if start/end date was provided
    let filteredCandles = candles;
    if (startDate || endDate) {
        filteredCandles = candles.filter(c => {
            let valid = true;
            if (startDate) valid = valid && c.timestamp >= startDate.getTime();
            if (endDate) valid = valid && c.timestamp <= endDate.getTime();
            return valid;
        });
    }

    res.json({
      symbol,
      timeframe,
      count: filteredCandles.length,
      data: filteredCandles
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch history data', details: e });
  }
});

export default router;
