import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Config {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPaths = [
      path.join(process.cwd(), 'config.json'),
      path.join(process.cwd(), 'config.local.json'),
      path.join(__dirname, '../../config.json'),
      path.join(__dirname, '../../config.local.json')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configData);
      }
    }

    // デフォルト設定
    return {
      mcp: {
        provider: 'kamui-code',
        configPath: process.env.MCP_CONFIG_PATH || '/path/to/your/mcp-config.json'
      },
      models: {
        image: {
          default: process.env.DEFAULT_IMAGE_MODEL || 't2i-default-model',
          options: []
        },
        video: {
          default: process.env.DEFAULT_VIDEO_MODEL || 't2v-default-model',
          options: []
        }
      },
      server: {
        port: parseInt(process.env.PORT || '3011'),
        host: process.env.HOST || 'localhost',
        outputDir: process.env.OUTPUT_DIR || './public/generated'
      },
      client: {
        serverUrl: process.env.CLIENT_SERVER_URL || `http://localhost:${parseInt(process.env.PORT || '3011')}`,
        defaultWidth: parseInt(process.env.DEFAULT_WIDTH || '512'),
        defaultHeight: parseInt(process.env.DEFAULT_HEIGHT || '512'),
        defaultDuration: parseInt(process.env.DEFAULT_DURATION || '3')
      }
    };
  }

  get(path) {
    const keys = path.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  getAll() {
    return this.config;
  }
}

export default new Config();