import { TickerSubscription } from './TickerSubscription';
import { TradingViewWebSocket } from './TradingViewWebSocket';
export declare class TradingViewAPI {
    private subscriptionMap;
    ws: TradingViewWebSocket;
    private isSetup;
    setup(): Promise<void>;
    cleanup(): Promise<void>;
    getTicker(simpleOrProName: string): Promise<TickerSubscription>;
    ensureRegistered(ticker: TickerSubscription): Promise<void>;
    private formatTimeframe;
    private timeframeToSeconds;
    getCandle(symbol: string, timeframe: string): Promise<any>;
    getHistory(symbol: string, timeframe: string, count?: number, start?: Date, end?: Date): Promise<any[]>;
}
//# sourceMappingURL=TradingViewAPI.d.ts.map