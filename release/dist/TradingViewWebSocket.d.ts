/// <reference types="node" />
import { EventEmitter } from 'events';
export declare class TradingViewWebSocket extends EventEmitter {
    private static DEFAULT_TIMEOUT;
    private static UNAUTHORIZED_USER_TOKEN;
    private static generateSession;
    private ws;
    private quoteSession;
    private chartSession;
    private subscriptions;
    connect(): Promise<void>;
    disconnect(): void;
    registerSymbol(symbol: string): Promise<void>;
    unregisterSymbol(symbol: string): Promise<void>;
    private onPacket;
    private setAuthToken;
    private createQuoteSession;
    createChartSession(sessionId?: string): void;
    resolveSymbol(symbol: string, symbolId: string, sessionId?: string): void;
    createSeries(seriesId: string, symbolId: string, timeframe: string, count: number, sessionId?: string): void;
    requestMoreData(seriesId: string, count: number, sessionId?: string): void;
    setRange(seriesId: string, from: number, to: number, sessionId?: string): void;
    private setQuoteFields;
    private addQuoteSymbol;
    private removeQuoteSymbol;
    private wsOnMessage;
    private wsSendRaw;
    private wsSend;
    private wsReady;
    private tvSessionReady;
}
//# sourceMappingURL=TradingViewWebSocket.d.ts.map