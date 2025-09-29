import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCPClient } from './mcp-client.js';
import { selectModelFromCommand } from '../config/models.js';
import config from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ChocoDrop Server
 * Express server for natural language command processing and image generation
 */
class ChocoDropServer {
  constructor(options = {}) {
    this.port = options.port || config.get('server.port');
    this.host = options.host || config.get('server.host');
    this.publicDir = options.publicDir || path.join(__dirname, '../../public');

    // MCP Client初期化
    this.mcpClient = new MCPClient({
      mcpConfigPath: options.mcpConfigPath,
      outputDir: path.join(this.publicDir, 'generated'),
      serverUrl: `http://${this.host}:${this.port}`,
      kamuiCommand: options.kamuiCommand,
      server: this
    });

    // SSE進捗管理
    this.progressClients = new Map();

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    console.log('🍫 ChocoDropServer initialized');
  }

  /**
   * ミドルウェア設定
   */
  setupMiddleware() {
    const defaultCorsOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:8000',
      'http://localhost:8001'
    ];
    const configuredCorsOrigins = config.get('server.corsOrigins');
    const allowedCorsOrigins = Array.isArray(configuredCorsOrigins)
      ? [...defaultCorsOrigins, ...configuredCorsOrigins]
      : defaultCorsOrigins;
    const uniqueCorsOrigins = [...new Set(allowedCorsOrigins.filter(Boolean))];

    // CORS設定
    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || uniqueCorsOrigins.includes(origin)) {
          return callback(null, true);
        }
        console.warn(`⚠️ CORS denied for origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }));

    // JSON解析
    this.app.use(express.json({ limit: '10mb' }));
    
    // 静的ファイル配信
    this.app.use('/generated', express.static(path.join(this.publicDir, 'generated')));
    this.app.use(express.static(this.publicDir));
    
    // ログミドルウェア
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * ルート設定
   */
  setupRoutes() {
    // ヘルスチェック
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime()
      });
    });

    // 設定情報取得
    this.app.get('/api/config', (req, res) => {
      res.json({
        serverUrl: config.get('client.serverUrl'),
        port: config.get('server.port'),
        host: config.get('server.host')
      });
    });

    // 利用可能なサービス一覧
    this.app.get('/api/services', (req, res) => {
      try {
        const summary = this.mcpClient.getAvailableServicesSummary();
        const defaults = {
          image: this.mcpClient.getDefaultServiceId('image'),
          video: this.mcpClient.getDefaultServiceId('video')
        };

        const allServices = [...summary.image, ...summary.video];

        res.json({
          success: true,
          services: allServices.map(service => service.id),
          metadata: summary,
          models: {
            image: summary.image,
            video: summary.video
          },
          default: defaults
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          errorCategory: this.classifyError(error)
        });
      }
    });

    // モデル一覧API（設定ファイルベース）
    this.app.get('/api/models', (req, res) => {
      try {
        const summary = this.mcpClient.getAvailableServicesSummary();
        const defaults = {
          image: this.mcpClient.getDefaultServiceId('image'),
          video: this.mcpClient.getDefaultServiceId('video')
        };

        res.json({
          success: true,
          models: {
            image: {
              default: defaults.image,
              options: summary.image.map(service => service.id)
            },
            video: {
              default: defaults.video,
              options: summary.video.map(service => service.id)
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
          errorCategory: this.classifyError(error)
        });
      }
    });

    // 画像生成API
    this.app.post('/api/generate', async (req, res) => {
      try {
        const defaultImageService = this.mcpClient.getDefaultServiceId('image');
        const { prompt, width = 512, height = 512, service = defaultImageService } = req.body;
        
        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'プロンプトが必要です'
          });
        }

        console.log(`🎨 Image generation request: "${prompt}" with service: ${service}`);

        // タスクID生成
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const result = await this.mcpClient.generate(prompt, {
          type: 'image',
          width,
          height,
          service,
          taskId
        });

        // モデル情報を追加
        const imageServiceInfo = this.mcpClient
          .getServicesByType('image')
          .find(entry => entry.id === service);
        if (imageServiceInfo) {
          result.modelName = imageServiceInfo.name;
          result.serviceName = service;
        } else {
          result.serviceName = service;
          result.modelName = service;
        }

        res.json(result);

      } catch (error) {
        console.error('❌ Image generation API error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          errorCategory: this.classifyError(error),
          fallbackUrl: this.mcpClient.generatePlaceholderImage(req.body.prompt || 'エラー')
        });
      }
    });

    // 動画生成API
    this.app.post('/api/generate-video', async (req, res) => {
      try {
        const defaultVideoService = this.mcpClient.getDefaultServiceId('video');
        const {
          prompt,
          model = defaultVideoService,
          aspect_ratio,
          resolution,
          negative_prompt,
          seed,
          enable_safety_checker,
          enable_prompt_expansion,
          frames_per_second,
          guidance_scale,
          duration,
          width,
          height
        } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'プロンプトが必要です'
          });
        }

        console.log(`🎬 Video generation request: "${prompt}" with model: ${model}`);

        // タスクID生成
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const safeDefaults = {
          aspect_ratio: '16:9',
          resolution: '720p',
          enable_safety_checker: true,
          enable_prompt_expansion: true
        };

        const generateOptions = {
          type: 'video',
          model,
          taskId,
          duration: duration ?? 3,
          aspect_ratio: aspect_ratio || safeDefaults.aspect_ratio,
          resolution: resolution || safeDefaults.resolution,
          enable_safety_checker: enable_safety_checker ?? safeDefaults.enable_safety_checker,
          enable_prompt_expansion: enable_prompt_expansion ?? safeDefaults.enable_prompt_expansion
        };

        if (typeof width === 'number' && width > 0) {
          generateOptions.width = width;
        }

        if (typeof height === 'number' && height > 0) {
          generateOptions.height = height;
        }

        if (typeof seed === 'number') {
          generateOptions.seed = seed;
        }

        if (negative_prompt) {
          generateOptions.negative_prompt = negative_prompt;
        }

        if (typeof frames_per_second === 'number' && frames_per_second > 0) {
          generateOptions.frames_per_second = frames_per_second;
        }

        if (typeof guidance_scale === 'number' && guidance_scale > 0) {
          generateOptions.guidance_scale = guidance_scale;
        }

        const result = await this.mcpClient.generate(prompt, generateOptions);

        // エラーレスポンスの場合は適切なHTTPステータスコードで返す
        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.error || '動画生成に失敗しました'
          });
        }

        // モデル情報を追加
        const videoServiceInfo = this.mcpClient
          .getServicesByType('video')
          .find(entry => entry.id === model);
        if (videoServiceInfo) {
          result.modelName = videoServiceInfo.name;
          result.serviceName = model;
        } else {
          result.serviceName = model;
          result.modelName = model;
        }

        res.json(result);

      } catch (error) {
        console.error('❌ Video generation API error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          errorCategory: this.classifyError(error)
        });
      }
    });

    // SSE: リアルタイム進捗更新
    this.app.get('/api/progress/:taskId', (req, res) => {
      const taskId = req.params.taskId;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      res.write('data: {"type":"connected","taskId":"' + taskId + '"}\n\n');

      this.progressClients.set(taskId, res);

      req.on('close', () => {
        this.progressClients.delete(taskId);
      });
    });

    // 自然言語コマンド実行API
    this.app.post('/api/command', async (req, res) => {
      try {
        const { command } = req.body;
        
        if (!command) {
          return res.status(400).json({
            success: false,
            error: 'コマンドが必要です'
          });
        }

        console.log(`🎯 Natural language command: "${command}"`);

        // タスクID生成
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // コマンド解析とタイプ判定
        const parsed = this.parseCommand(command);
        console.log(`📊 Parsed command:`, parsed);

        let result;
        switch (parsed.type) {
          case 'image_generation':
            // コマンドから自動モデル選択
            const selectedModel = selectModelFromCommand(command);
            result = await this.mcpClient.generate(parsed.prompt, {
              type: 'image',
              width: 512,
              height: 512,
              service: parsed.service || selectedModel.id,
              taskId: taskId
            });

            // 3D配置情報を追加
            result.position = parsed.position;
            result.size = parsed.size;
            result.prompt = parsed.prompt;
            break;

          case 'modify':
            // オブジェクト変更コマンド - 現在は画像再生成で対応
            const modifyModel = selectModelFromCommand(command);
            result = await this.mcpClient.generate(parsed.prompt, {
              type: 'image',
              width: 512,
              height: 512,
              service: modifyModel.id,
              taskId: taskId
            });

            result.isModification = true;
            result.originalCommand = command;
            result.prompt = parsed.prompt;
            break;

          default:
            result = {
              success: false,
              error: `未対応のコマンドタイプ: ${parsed.type}。サポートされているコマンド: 画像生成、オブジェクト変更`
            };
        }

        // レスポンスにtaskIdを追加
        if (result && typeof result === 'object') {
          result.taskId = taskId;
        }

        res.json(result);

      } catch (error) {
        console.error('❌ Command API error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          errorCategory: this.classifyError(error)
        });
      }
    });

    // 404ハンドラー
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'エンドポイントが見つかりません'
      });
    });

    // エラーハンドラー
    this.app.use((error, req, res, next) => {
      console.error('❌ Server error:', error);
      res.status(500).json({
        success: false,
        error: 'サーバーエラーが発生しました',
        errorCategory: this.classifyError(error)
      });
    });
  }

  /**
   * 自然言語コマンド解析
   */
  parseCommand(command) {
    const cmd = command.toLowerCase().trim();
    
    // 画像生成コマンド（優先）
    if (cmd.includes('画像') || cmd.includes('作って') || cmd.includes('生成') || 
        cmd.includes('ユニコーン') || cmd.includes('猫') || cmd.includes('犬') || 
        cmd.includes('ドラゴン') || cmd.includes('龍') || cmd.includes('花')) {
      return this.parseImageGenerationCommand(cmd);
    }
    
    // オブジェクト変更コマンド（既存オブジェクトの変更のみ）
    if ((cmd.includes('色') || cmd.includes('大きさ') || cmd.includes('位置') ||
         cmd.includes('モノクロ') || cmd.includes('白黒') || cmd.includes('グレー') ||
         cmd.includes('変更') || cmd.includes('変える')) &&
        !cmd.includes('ユニコーン') && !cmd.includes('猫') && !cmd.includes('犬') &&
        !cmd.includes('ドラゴン') && !cmd.includes('龍') && !cmd.includes('花')) {
      return {
        type: 'modify',
        prompt: command,
        command: command
      };
    }
    
    // 削除コマンド
    if (cmd.includes('削除') || cmd.includes('消去') || cmd.includes('取り除')) {
      return {
        type: 'delete',
        target: 'all',
        command: command
      };
    }
    
    // デフォルト: 画像生成として処理
    return {
      type: 'image_generation',
      prompt: command,
      position: this.parsePosition(cmd),
      size: this.parseSize(cmd)
    };
  }

  /**
   * 画像生成コマンド解析
   */
  parseImageGenerationCommand(command) {
    // プロンプト抽出 (「を」「に」「で」などで区切る)
    let prompt = command;
    const particles = ['を', 'に', 'で', 'の'];
    
    for (const particle of particles) {
      if (command.includes(particle)) {
        const parts = command.split(particle);
        if (parts[0]) {
          prompt = parts[0].trim();
          break;
        }
      }
    }
    
    // 不要な語句を除去
    prompt = prompt
      .replace(/(画像|作って|生成|して|ください)/g, '')
      .trim();
    
    // 自動モデル選択
    const selectedModel = selectModelFromCommand(command);
    let service = selectedModel.id;
    
    // プロンプト強化は mcp-client.js で統一処理
    
    return {
      type: 'image_generation',
      prompt,
      position: this.parsePosition(command),
      size: this.parseSize(command),
      service
    };
  }

  /**
   * 位置情報解析（カメラ相対位置）
   */
  parsePosition(command) {
    const defaultPos = { x: 0, y: 5, z: -10 };
    
    if (command.includes('右上')) return { x: 5, y: 8, z: -12 };
    if (command.includes('左上')) return { x: -8, y: 12, z: -15 };
    if (command.includes('右下')) return { x: 8, y: 2, z: -10 };
    if (command.includes('左下')) return { x: -8, y: 2, z: -10 };
    if (command.includes('右に')) return { x: 8, y: 5, z: -10 };
    if (command.includes('左に')) return { x: -8, y: 5, z: -10 };
    if (command.includes('中央') || command.includes('真ん中')) return { x: 0, y: 6, z: -12 };
    if (command.includes('空')) return { x: 0, y: 15, z: -10 };
    if (command.includes('地面')) return { x: 0, y: 1, z: -8 };
    
    return defaultPos;
  }

  /**
   * サイズ解析
   */
  parseSize(command) {
    if (command.includes('大きな') || command.includes('大きい')) return { scale: 2.0 };
    if (command.includes('小さな') || command.includes('小さい')) return { scale: 0.5 };
    return { scale: 1.0 };
  }

  classifyError(error) {
    if (!error) {
      return 'UNKNOWN';
    }

    const message = typeof error.message === 'string' ? error.message : '';
    const normalized = message.toLowerCase();

    if (normalized.includes('mcp config')) {
      return 'MCP_CONFIG_MISSING';
    }

    if (normalized.includes('mcp client not initialized')) {
      return 'MCP_CONFIG_MISSING';
    }

    if (normalized.includes('econnrefused')) {
      return 'EXTERNAL_SERVICE_UNREACHABLE';
    }

    return 'UNKNOWN';
  }

  /**
   * Seedream V4用プロンプト強化
   */
  // 削除済み - 処理は mcp-client.js の統一システムに移行

  /**
   * Qwen Image用プロンプト強化
   */
  // 削除済み - 処理は mcp-client.js の統一システムに移行

  /**
   * 進捗データをクライアントに送信
   */
  sendProgress(taskId, progressData) {
    const client = this.progressClients.get(taskId);
    if (client) {
      try {
        const data = JSON.stringify({
          type: 'progress',
          taskId: taskId,
          ...progressData
        });
        client.write(`data: ${data}\n\n`);
      } catch (error) {
        console.error(`⚠️ Failed to send progress to ${taskId}:`, error);
        this.progressClients.delete(taskId);
      }
    }
  }

  /**
   * サーバー開始
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          console.log(`🚀 ChocoDrop Server running at http://${this.host}:${this.port}`);
          console.log(`📁 Static files served from: ${this.publicDir}`);
          resolve({ host: this.host, port: this.port });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * サーバー停止
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 ChocoDrop Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// CLI実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ChocoDropServer({
    port: process.env.PORT || config.get('server.port'),
    host: process.env.HOST || 'localhost'
  });

  server.start().catch(error => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down server...');
    await server.stop();
    process.exit(0);
  });
}

export { ChocoDropServer };
export { ChocoDropServer as ChocoDroServer };
export { ChocoDropServer as LiveCommandServer };
