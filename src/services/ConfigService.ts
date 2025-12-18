import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

export interface AppConfig {
  serverUrl: string;
  adminPassword: string;
}

export class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = {
      serverUrl: 'http://localhost:3001',
      adminPassword: 'admin'
    };
    this.loadConfig();
  }

  private loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loaded = JSON.parse(data);
        this.config = { ...this.config, ...loaded };
      } catch (e) {
        console.error('Failed to load config, using defaults');
      }
    } else {
      this.saveConfig();
    }
  }

  public saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  public get() {
    return this.config;
  }

  public update(newConfig: Partial<AppConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }
}

export const configService = new ConfigService();
