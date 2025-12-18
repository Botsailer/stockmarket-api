import { SIOPacket } from '../interfaces/SIOPacket';
export declare const parseMessages: (str: string) => SIOPacket[];
export declare const prependHeader: (str: string) => string;
export declare const createMessage: (func: string, paramList: any[]) => string;
//# sourceMappingURL=SIOProtocol.d.ts.map