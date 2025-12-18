/// <reference types="node" />
import { EventEmitter } from 'events';
import type { TradingViewAPI } from './TradingViewAPI';
import { TickerData } from './interfaces/TickerData';
export declare class TickerSubscription extends EventEmitter {
    simpleOrProName: string;
    due: number;
    private api;
    private tickerData;
    destroyed: boolean;
    constructor(api: TradingViewAPI, simpleOrProName: string);
    updateData(tickerDataPatch: TickerData): void;
    fetch(): Promise<TickerData>;
    get canBeDestroyed(): boolean;
    private refreshDue;
}
//# sourceMappingURL=TickerSubscription.d.ts.map