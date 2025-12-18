export interface AppConfig {
    serverUrl: string;
    adminPassword: string;
}
export declare class ConfigService {
    private config;
    constructor();
    private loadConfig;
    saveConfig(): void;
    get(): AppConfig;
    update(newConfig: Partial<AppConfig>): void;
}
export declare const configService: ConfigService;
//# sourceMappingURL=ConfigService.d.ts.map