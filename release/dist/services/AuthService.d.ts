export interface ApiKey {
    key: string;
    owner: string;
    domains: string[];
    rateLimit: number;
    createdAt: string;
}
export declare class AuthService {
    private keys;
    constructor();
    private loadKeys;
    private saveKeys;
    validateKey(key: string, origin: string | undefined): {
        valid: boolean;
        error?: string;
        limit?: number;
    };
    createKey(owner: string, domains?: string, rateLimit?: number): ApiKey;
    deleteKey(key: string): void;
    getAllKeys(): ApiKey[];
}
export declare const authService: AuthService;
//# sourceMappingURL=AuthService.d.ts.map