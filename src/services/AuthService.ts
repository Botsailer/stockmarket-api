import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const KEYS_FILE = path.join(process.cwd(), 'api_keys.json');

export interface ApiKey {
  key: string;
  owner: string;
  domains: string[]; // ["*"] or ["example.com"]
  rateLimit: number; // requests per minute
  createdAt: string;
}

export class AuthService {
  private keys: ApiKey[] = [];

  constructor() {
    this.loadKeys();
  }

  private loadKeys() {
    if (fs.existsSync(KEYS_FILE)) {
      const data = fs.readFileSync(KEYS_FILE, 'utf-8');
      try {
        this.keys = JSON.parse(data).keys;
      } catch (e) {
        this.keys = [];
      }
    }
  }

  private saveKeys() {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: this.keys }, null, 2));
  }

  public validateKey(key: string, origin: string | undefined): { valid: boolean; error?: string; limit?: number } {
    const keyData = this.keys.find(k => k.key === key);
    if (!keyData) {
      return { valid: false, error: 'Invalid API Key' };
    }

    if (keyData.domains.includes('*')) {
      return { valid: true, limit: keyData.rateLimit };
    }

    if (!origin) {
      return { valid: false, error: 'Origin header required for this key' };
    }

    // Simple domain check (can be improved with regex)
    const allowed = keyData.domains.some(d => origin.includes(d));
    if (!allowed) {
      return { valid: false, error: 'Domain not whitelisted' };
    }

    return { valid: true, limit: keyData.rateLimit };
  }

  public createKey(owner: string, domains: string = '*', rateLimit: number = 60): ApiKey {
    const newKey: ApiKey = {
      key: 'tv_' + crypto.randomBytes(16).toString('hex'),
      owner,
      domains: domains.split(',').map(d => d.trim()),
      rateLimit,
      createdAt: new Date().toISOString()
    };
    this.keys.push(newKey);
    this.saveKeys();
    return newKey;
  }

  public deleteKey(key: string) {
    this.keys = this.keys.filter(k => k.key !== key);
    this.saveKeys();
  }

  public getAllKeys() {
    return this.keys;
  }
}

export const authService = new AuthService();
