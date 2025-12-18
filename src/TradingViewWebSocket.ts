import { EventEmitter } from 'events';
import randomstring from 'randomstring';
import WebSocket from 'ws';

import { allQuoteFields } from './consts/QuoteFields';
import { SIOPacket } from './interfaces/SIOPacket';
import * as SIO from './utils/SIOProtocol';

export class TradingViewWebSocket extends EventEmitter {
  private static DEFAULT_TIMEOUT = 3000;
  private static UNAUTHORIZED_USER_TOKEN = 'unauthorized_user_token';
  private static generateSession() {
    return 'qs_' + randomstring.generate({ length: 12, charset: 'alphabetic' });
  }

  private ws: WebSocket | null = null;
  private quoteSession: string | null = null;
  private chartSession: string | null = null;
  private subscriptions: Set<string> = new Set();

  public async connect() {
    if (this.ws) {
      this.disconnect();
    }
    this.quoteSession = null;
    this.chartSession = null;
    this.ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
      origin: 'https://www.tradingview.com',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    this.ws.on('message', message => this.wsOnMessage(message.toString()));
    await this.tvSessionReady();
  }

  public disconnect() {
    if (!this.ws) {
      return;
    }
    this.ws.close();
    this.ws = null;
    this.quoteSession = null;
    this.subscriptions = new Set();
  }

  public async registerSymbol(symbol: string) {
    if (this.subscriptions.has(symbol)) {
      return;
    }
    this.subscriptions.add(symbol);
    this.addQuoteSymbol(symbol);
  }

  public async unregisterSymbol(symbol: string) {
    if (!this.subscriptions.delete(symbol)) {
      return;
    }
    this.removeQuoteSymbol(symbol);
  }

  private onPacket(packet: SIOPacket) {
    if (packet.isKeepAlive) {
      // Handle protocol keepalive packets
      this.wsSendRaw('~h~' + (packet.data as string));
      return;
    }
    const data = packet.data;
    // Handle session packet
    if (data.session_id) {
      this.setAuthToken(TradingViewWebSocket.UNAUTHORIZED_USER_TOKEN);
      this.createQuoteSession();
      this.createChartSession();
      this.setQuoteFields(allQuoteFields);
      return;
    }
    if (
      data.m &&
      data.m === 'qsd' &&
      typeof data.p === 'object' &&
      data.p.length > 1 &&
      data.p[0] === this.quoteSession
    ) {
      const tickerData = data.p[1];
      this.emit('data', tickerData.n, tickerData.s, tickerData.v);
    }
    if (
      data.m &&
      data.m === 'timescale_update' &&
      typeof data.p === 'object' &&
      data.p.length > 1 &&
      data.p[0] === this.chartSession
    ) {
      this.emit('chart_data', data.p[1]);
    }
  }

  private setAuthToken(token: string) {
    this.wsSend('set_auth_token', [token]);
  }

  private createQuoteSession() {
    this.quoteSession = TradingViewWebSocket.generateSession();
    this.wsSend('quote_create_session', [this.quoteSession]);
  }

  private createChartSession() {
    this.chartSession = 'cs_' + randomstring.generate({ length: 12, charset: 'alphabetic' });
    this.wsSend('chart_create_session', [this.chartSession, '']);
  }

  public resolveSymbol(symbol: string, symbolId: string) {
    this.wsSend('resolve_symbol', [this.chartSession, symbolId, symbol]);
  }

  public createSeries(seriesId: string, symbolId: string, timeframe: string, count: number) {
    this.wsSend('create_series', [this.chartSession, seriesId, 's1', symbolId, timeframe, count]);
  }

  private setQuoteFields(fields: string[]) {
    this.wsSend('quote_set_fields', [this.quoteSession, ...fields]);
  }

  private addQuoteSymbol(symbol: string) {
    this.wsSend('quote_add_symbols', [this.quoteSession, symbol]);
  }

  private removeQuoteSymbol(symbol: string) {
    this.wsSend('quote_remove_symbols', [this.quoteSession, symbol]);
  }

  private wsOnMessage(data: string) {
    this.emit('debug_log', 'RX', data);
    const packets = SIO.parseMessages(data);
    packets.forEach((packet: SIOPacket) => this.onPacket(packet));
  }

  private wsSendRaw(message: string) {
    this.emit('debug_log', 'TX', message);
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(SIO.prependHeader(message));
    } else {
      this.ws.once('open', () => {
        this.ws?.send(SIO.prependHeader(message));
      });
    }
  }

  private wsSend(func: string, args: any[]) {
    const msg = SIO.createMessage(func, args);
    this.emit('debug_log', 'TX', msg);
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.ws.once('open', () => {
        this.ws?.send(msg);
      });
    }
  }

  private async wsReady(timeout?: number) {
    if (!timeout) {
      timeout = TradingViewWebSocket.DEFAULT_TIMEOUT;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      let opened = false;
      const onOpen = () => {
        opened = true;
        resolve();
      };
      this.ws?.once('open', onOpen);
      setTimeout(() => {
        if (!opened) {
          this.ws?.removeListener('open', onOpen);
          reject();
        }
      }, timeout);
    });
  }

  private async tvSessionReady(timeout?: number) {
    if (!timeout) {
      timeout = TradingViewWebSocket.DEFAULT_TIMEOUT;
    }
    await this.wsReady(timeout);

    return new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.quoteSession !== null) {
          resolve();
          clearInterval(interval);
        }
      }, 100);
      setTimeout(() => {
        if (interval) {
          clearInterval(interval);
          reject();
        }
      }, timeout);
    });
  }
}
