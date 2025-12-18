import { TickerSubscription } from './TickerSubscription';
import { TradingViewWebSocket } from './TradingViewWebSocket';

export class TradingViewAPI {
  private subscriptionMap: Map<string, Set<TickerSubscription>> = new Map();
  public ws: TradingViewWebSocket = new TradingViewWebSocket();
  private isSetup = false;

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
  }

  public async cleanup() {
    this.ws.disconnect();
    this.isSetup = false;
    this.subscriptionMap.clear();
  }

  public async getTicker(simpleOrProName: string): Promise<TickerSubscription> {
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
      }, 3000);
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

  public async getCandle(symbol: string, timeframe: string): Promise<any> {
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
             resolve({
               timestamp: lastCandle.v[0] * 1000, // TV uses seconds
               open: lastCandle.v[1],
               high: lastCandle.v[2],
               low: lastCandle.v[3],
               close: lastCandle.v[4],
               volume: lastCandle.v[5]
             });
          } else {
             resolve(null);
          }
        }
      };

      this.ws.on('chart_data', onChartData);
      
      // Ensure we are connected
      if (!this.ws) {
         reject('WebSocket not initialized');
         return;
      }

      try {
        this.ws.resolveSymbol(symbol, symbolId);
        this.ws.createSeries(seriesId, symbolId, formattedTimeframe, 10); 
      } catch (e) {
        this.ws.removeListener('chart_data', onChartData);
        reject(e);
        return;
      }
      
      setTimeout(() => {
        this.ws.removeListener('chart_data', onChartData);
        reject('Chart fetch timed out');
      }, 10000);
    });
  }
}
