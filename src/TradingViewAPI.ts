import { TickerSubscription } from './TickerSubscription';
import { TradingViewWebSocket } from './TradingViewWebSocket';

export class TradingViewAPI {
  private subscriptionMap: Map<string, Set<TickerSubscription>> = new Map();
  public ws: TradingViewWebSocket = new TradingViewWebSocket();
  private isSetup = false;

  // Reconnection logic variables
  private activeApiCalls = 0;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private pendingReconnect = false;
  private static RECONNECT_INTERVAL_MS = 60000; // 1 minute

  // Increment active API call counter
  private incrementApiCalls(): void {
    this.activeApiCalls++;
    console.log(`[API] Active API calls: ${this.activeApiCalls}`);
  }

  // Decrement active API call counter and trigger reconnect if pending
  private async decrementApiCalls(): Promise<void> {
    this.activeApiCalls--;
    console.log(`[API] Active API calls: ${this.activeApiCalls}`);
    
    // If no more active calls and reconnect is pending, do it now
    if (this.activeApiCalls === 0 && this.pendingReconnect) {
      console.log('[API] All API calls completed. Executing pending reconnect...');
      this.pendingReconnect = false;
      await this.reconnectWebSocket();
    }
  }

  // Reconnect the WebSocket
  private async reconnectWebSocket(): Promise<void> {
    console.log('[API] Reconnecting WebSocket...');
    try {
      this.ws.disconnect();
      await this.ws.connect();
      console.log('[API] WebSocket reconnected successfully');
    } catch (e) {
      console.error('[API] WebSocket reconnection failed:', e);
    }
  }

  // Schedule reconnect - either do it now or mark as pending
  private async scheduleReconnect(): Promise<void> {
    if (this.activeApiCalls > 0) {
      console.log(`[API] API calls in progress (${this.activeApiCalls}). Marking reconnect as pending...`);
      this.pendingReconnect = true;
    } else {
      console.log('[API] No active API calls. Reconnecting now...');
      await this.reconnectWebSocket();
    }
  }

  // Start the periodic reconnection timer
  private startReconnectTimer(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    
    this.reconnectInterval = setInterval(async () => {
      console.log('[API] Periodic reconnect check triggered...');
      await this.scheduleReconnect();
    }, TradingViewAPI.RECONNECT_INTERVAL_MS);
    
    console.log(`[API] Reconnect timer started (every ${TradingViewAPI.RECONNECT_INTERVAL_MS / 1000}s)`);
  }

  // Stop the periodic reconnection timer
  private stopReconnectTimer(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
      console.log('[API] Reconnect timer stopped');
    }
  }

  public async setup() {
    if (this.isSetup) {
      return;
    }
    this.isSetup = true;

    this.ws.on('data', (simpleOrProName: string, status: string, data: any) => {
      if (status !== 'ok') {
        return;
      }
      const subs = this.subscriptionMap.get(simpleOrProName);
      if (!subs) {
        return;
      }
      subs.forEach((s: TickerSubscription) => {
        if (s.canBeDestroyed) {
          subs.delete(s);
          s.destroyed = true;
          if (subs.size === 0) {
            this.ws.unregisterSymbol(s.simpleOrProName);
            this.subscriptionMap.delete(s.simpleOrProName);
          }
          return;
        }
        s.updateData(data);
      });
    });
    await this.ws.connect();
    
    // Start the periodic reconnection timer
    this.startReconnectTimer();
  }

  public async cleanup() {
    this.stopReconnectTimer();
    this.ws.disconnect();
    this.isSetup = false;
    this.subscriptionMap.clear();
    this.activeApiCalls = 0;
    this.pendingReconnect = false;
  }

  public async getTicker(simpleOrProName: string): Promise<TickerSubscription> {
    this.incrementApiCalls();
    try {
      const tickers = this.subscriptionMap.get(simpleOrProName);
      if (tickers && tickers.size > 0) {
        return tickers.values().next().value;
      }

      const ticker = new TickerSubscription(this, simpleOrProName);
      try {
        await ticker.fetch();
      } catch (e) {
        // If fetch fails (timeout), we still return the ticker so the user can listen for future updates
        // or retry. The error is logged but doesn't crash the flow.
        console.warn(`Initial fetch timed out for ${simpleOrProName}, but subscription is active.`);
      }
      return ticker;
    } finally {
      await this.decrementApiCalls();
    }
  }

  public async ensureRegistered(ticker: TickerSubscription): Promise<void> {
    const tickers = this.subscriptionMap.get(ticker.simpleOrProName);
    if (tickers && tickers.has(ticker)) {
      return;
    }
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let updated = false;
      const onUpdate = (data: any) => {
        if (!data.pro_name) {
          return;
        }
        updated = true;
        ticker.removeListener('update', onUpdate);
        resolve();
      };
      ticker.on('update', onUpdate);
      if (!tickers) {
        await this.ws.registerSymbol(ticker.simpleOrProName);
        this.subscriptionMap.set(ticker.simpleOrProName, new Set([ticker]));
      } else if (!tickers.has(ticker)) {
        await this.ws.registerSymbol(ticker.simpleOrProName);
        this.subscriptionMap.set(ticker.simpleOrProName, tickers.add(ticker));
      }
      setTimeout(() => {
        if (!updated) {
          ticker.removeListener('update', onUpdate);
          reject('Timed out.');
        }
      }, 5000); // Increased timeout to 5 seconds
    });
  }

  private formatTimeframe(tf: string): string {
    if (tf === '1D' || tf === 'D') return '1D';
    if (tf === '1W' || tf === 'W') return '1W';
    if (tf === '1M' || tf === 'M') return '1M';
    
    if (tf.endsWith('m')) {
      return tf.replace('m', '');
    }
    if (tf.endsWith('h')) {
      const hours = parseInt(tf.replace('h', ''));
      return (hours * 60).toString();
    }
    // Default to passing it through if it's just a number or unknown
    return tf;
  }

  private timeframeToSeconds(tf: string): number {
    if (tf === '1D' || tf === 'D') return 86400;
    if (tf.toUpperCase().endsWith('D')) {
        const days = parseInt(tf.replace(/d|D/g, ''));
        return isNaN(days) ? 86400 : days * 86400;
    }
    if (tf.toUpperCase().endsWith('W')) {
        const weeks = parseInt(tf.replace(/w|W/g, ''));
        return isNaN(weeks) ? 604800 : weeks * 604800;
    }
    if (tf.toUpperCase().endsWith('M') && !tf.endsWith('m')) {
        const months = parseInt(tf.replace(/m|M/g, ''));
        return isNaN(months) ? 2592000 : months * 2592000; // Approx 30 days
    }
    
    if (tf.endsWith('m')) {
        const minutes = parseInt(tf.replace('m', ''));
        return isNaN(minutes) ? 60 : minutes * 60;
    }
    if (tf.endsWith('h')) {
        const hours = parseInt(tf.replace('h', ''));
        return isNaN(hours) ? 3600 : hours * 3600;
    }
    
    // If it's just a number, it's minutes
    if (!isNaN(Number(tf))) return Number(tf) * 60;
    
    return 86400; // Default to 1 day
  }

  public async getCandle(symbol: string, timeframe: string): Promise<any> {
    this.incrementApiCalls();
    const symbolId = 'sym_' + Math.floor(Math.random() * 100000);
    const seriesId = 'ser_' + Math.floor(Math.random() * 100000);
    const formattedTimeframe = this.formatTimeframe(timeframe);
    
    return new Promise((resolve, reject) => {
      const onChartData = (data: any) => {
        if (data[seriesId] && data[seriesId].s) {
          const candles = data[seriesId].s;
          const lastCandle = candles[candles.length - 1];
          
          // Cleanup
          this.ws.removeListener('chart_data', onChartData);
          
          // Format: { v: [time, open, high, low, close, volume] }
          // TV sends: { i: 0, v: [ ... ] }
          if (lastCandle && lastCandle.v) {
             this.decrementApiCalls();
             resolve({
               timestamp: lastCandle.v[0] * 1000, // TV uses seconds
               open: lastCandle.v[1],
               high: lastCandle.v[2],
               low: lastCandle.v[3],
               close: lastCandle.v[4],
               volume: lastCandle.v[5]
             });
          } else {
             this.decrementApiCalls();
             resolve(null);
          }
        }
      };

      this.ws.on('chart_data', onChartData);
      
      // Ensure we are connected
      if (!this.ws) {
         this.decrementApiCalls();
         reject('WebSocket not initialized');
         return;
      }

      try {
        this.ws.resolveSymbol(symbol, symbolId);
        this.ws.createSeries(seriesId, symbolId, formattedTimeframe, 10); 
      } catch (e) {
        this.ws.removeListener('chart_data', onChartData);
        this.decrementApiCalls();
        reject(e);
        return;
      }
      
      setTimeout(() => {
        this.ws.removeListener('chart_data', onChartData);
        this.decrementApiCalls();
        reject('Chart fetch timed out');
      }, 10000);
    });
  }

  public async getHistory(symbol: string, timeframe: string, count: number = 100, start?: Date, end?: Date): Promise<any[]> {
    this.incrementApiCalls();
    const chartSession = 'cs_' + Math.floor(Math.random() * 1000000); // Unique session for this request
    const symbolId = 'sym_' + Math.floor(Math.random() * 100000);
    const seriesId = 'ser_' + Math.floor(Math.random() * 100000);
    const formattedTimeframe = this.formatTimeframe(timeframe);
    
    if (start) {
        const endTime = end ? end.getTime() : Date.now();
        const diffSeconds = (endTime - start.getTime()) / 1000;
        const tfSeconds = this.timeframeToSeconds(timeframe);
        count = Math.ceil(diffSeconds / tfSeconds);
        // Add a buffer to ensure we cover the start date
        count += 100; // Increased buffer
    }

    // Ensure count is an integer
    count = Math.floor(count);

    console.log(`[DEBUG] getHistory: symbol=${symbol}, timeframe=${timeframe}, start=${start}, end=${end}, calculated_count=${count}`);

    return new Promise((resolve, reject) => {
      let allCandles: any[] = [];
      let resolveTimeout: NodeJS.Timeout | null = null;
      let rangeRequestSent = false;

      const onChartData = (data: any, sessionId: string) => {
        // Only process data for OUR session
        if (sessionId !== chartSession) return;

        console.log(`[DEBUG] onChartData received for session ${sessionId}. Keys: ${Object.keys(data).join(', ')}`);

        if (data[seriesId]) {
            console.log(`[DEBUG] Series data keys: ${Object.keys(data[seriesId]).join(', ')}`);
            if (data[seriesId].s) {
                console.log(`[DEBUG] Received ${data[seriesId].s.length} candles`);
            }
        }

        if (data[seriesId] && data[seriesId].s) {
          const newCandles = data[seriesId].s;
          
          // Map to our format
          const formatted = newCandles.map((candle: any) => {
             if (!candle.v) return null;
             return {
               timestamp: candle.v[0] * 1000,
               open: candle.v[1],
               high: candle.v[2],
               low: candle.v[3],
               close: candle.v[4],
               volume: candle.v[5]
             };
          }).filter((c: any) => c !== null);

          // Deduplicate logic
          const prevLength = allCandles.length;
          allCandles = [...allCandles, ...formatted];
          
          // Deduplicate by timestamp
          const uniqueCandles = Array.from(new Map(allCandles.map(item => [item.timestamp, item])).values());
          allCandles = uniqueCandles.sort((a, b) => a.timestamp - b.timestamp);

          console.log(`[DEBUG] Collected ${allCandles.length} / ${count} candles (New: ${allCandles.length - prevLength})`);

          // Check strategy
          // We use set_range if:
          // 1. We need a specific historical window (end date is provided)
          // 2. The requested count is very large (> 2000), to avoid pagination limits
          // If start is provided but end is NOT, we can just use createSeries with the calculated count (Latest N),
          // provided the count isn't huge.
          const useRange = (end !== undefined) || (count > 2000);

          if (useRange) {
              // If we haven't sent the range request yet, do it now!
              if (!rangeRequestSent) {
                  console.log(`[DEBUG] Initial series created. Now sending set_range...`);
                  rangeRequestSent = true;
                  
                  // Calculate range
                  let from: number;
                  const to = end ? Math.floor(end.getTime() / 1000) : Math.floor(Date.now() / 1000);

                  if (start) {
                      from = Math.floor(start.getTime() / 1000);
                  } else {
                      // Calculate start based on count
                      const tfSeconds = this.timeframeToSeconds(timeframe);
                      from = to - (count * tfSeconds);
                  }

                  // Ensure from is not negative
                  if (from < 0) from = 0;

                  console.log(`[DEBUG] Setting range: ${from} to ${to} (Count: ${count})`);
                  this.ws.setRange(seriesId, from, to, chartSession);
                  return; // Wait for next data packet
              }

              // If we HAVE sent the range request, this is the data!
              // Debounce resolution to catch multiple packets
              if (resolveTimeout) clearTimeout(resolveTimeout);
              resolveTimeout = setTimeout(() => {
                  console.log(`[DEBUG] Range strategy used. Assuming all available data received. Resolving.`);
                  this.ws.removeListener('chart_data', onChartData);
                  this.decrementApiCalls();
                  resolve(allCandles);
              }, 500); // Wait 500ms for more data
              return;
          }

          // Count Strategy Logic
          if (allCandles.length >= count) {
             // We have enough!
             console.log(`[DEBUG] Target reached. Resolving.`);
             if (resolveTimeout) clearTimeout(resolveTimeout);
             this.ws.removeListener('chart_data', onChartData);
             this.decrementApiCalls();
             resolve(allCandles.slice(-count)); // Return the requested amount (latest N)
          } else {
             // We need more!
             if (allCandles.length - prevLength === 0 && prevLength > 0) {
                 console.log(`[DEBUG] No new data received. We might be at the limit. Resolving.`);
                 if (resolveTimeout) clearTimeout(resolveTimeout);
                 this.ws.removeListener('chart_data', onChartData);
                 this.decrementApiCalls();
                 resolve(allCandles);
                 return;
             }
             
             console.log(`[DEBUG] Requesting more data...`);
             this.ws.requestMoreData(seriesId, 2000, chartSession);
          }
        }
      };

      this.ws.on('chart_data', onChartData);
      
      // Ensure we are connected
      if (!this.ws) {
         this.decrementApiCalls();
         reject('WebSocket not initialized');
         return;
      }

      try {
        // Create a temporary session for this request
        this.ws.createChartSession(chartSession);
        this.ws.resolveSymbol(symbol, symbolId, chartSession);
        
        // Strategy: Use set_range if a specific date range (end date) is requested OR if count is large (>2000).
        // If only start is provided (and end is now), we can use createSeries(count) which fetches the latest N candles.
        const useRange = (end !== undefined) || (count > 2000);
        console.log(`[DEBUG] Strategy: ${useRange ? 'Range (set_range)' : 'Count (create_series + pagination)'}`);

        // Always start with createSeries(1) to initialize if using range, or full count if not.
        if (useRange) {
             this.ws.createSeries(seriesId, symbolId, formattedTimeframe, 1, chartSession);
        } else {
             this.ws.createSeries(seriesId, symbolId, formattedTimeframe, count, chartSession); 
        }

      } catch (e) {
        this.ws.removeListener('chart_data', onChartData);
        this.decrementApiCalls();
        reject(e);
        return;
      }
      
      // Increase timeout for large fetches
      setTimeout(() => {
        this.ws.removeListener('chart_data', onChartData);
        this.decrementApiCalls();
        if (allCandles.length > 0) {
            console.log(`[DEBUG] Timeout reached, returning partial data (${allCandles.length})`);
            resolve(allCandles);
        } else {
            reject('Chart fetch timed out');
        }
      }, 30000); // 30 seconds timeout
    });
  }
}
