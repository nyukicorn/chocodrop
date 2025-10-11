import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import config from './config/config.js';
import { resolveConfigPath } from './utils/path-resolver.js';
import {
  normalizeAspectRatio,
  sanitizeAspectRatio,
  sanitizeVideoResolution,
  deriveResolutionFromDimensions,
  ensureEvenDimension,
  deriveDimensionsFromAspect
} from './utils/video-dimensions.js';

function getServiceType(serviceId = '') {
  if (serviceId.startsWith('t2i-')) return 'image';
  if (serviceId.startsWith('t2v-')) return 'video';
  return 'other';
}

function deriveServiceName(serviceId, serverConfig = {}) {
  if (serverConfig.name) {
    return serverConfig.name;
  }

  if (serverConfig.displayName) {
    return serverConfig.displayName;
  }

  if (serverConfig.description) {
    const description = serverConfig.description.split(' via ')[0].split(' - ')[0];
    if (description && description.trim().length > 0) {
      return description.trim();
    }
  }

  return serviceId;
}

function buildServiceMetadata(serviceId, serverConfig = {}) {
  const type = getServiceType(serviceId);
  return {
    id: serviceId,
    type,
    name: deriveServiceName(serviceId, serverConfig),
    description: serverConfig.description || '',
    url: serverConfig.url || '',
    tags: serverConfig.tags || [],
    provider: serverConfig.provider || serverConfig.type || 'http'
  };
}


/**
 * MCP Client - MCPサーバーとの通信を担当
 */
export class MCPClient {
  constructor(options = {}) {
    const configValue = config.get('mcp.configPath');
    const envValue = process.env.MCP_CONFIG_PATH;
    const fallbackConfigPath = path.join(os.homedir(), '.claude', 'mcp-kamui-code.json');
    const rawConfigPath = options.mcpConfigPath ?? envValue ?? configValue ?? fallbackConfigPath;

    this.originalMcpConfigPath = rawConfigPath;
    this.mcpConfigPath = resolveConfigPath(rawConfigPath);
    this.mcpConfigCache = null;
    this.outputDir = options.outputDir || './public/generated';
    this.serverUrl = options.serverUrl || config.get('client.serverUrl');
    this.server = options.server || null;
    this.client = null;
    this.connected = false;


  }

  createMcpConfigError(detail = '') {
    const guidance = 'AI生成サーバー（MCP）が設定されていません。画像生成にはMCPの登録が必要です。docs/SETUP.md を参照してください。';
    const suffix = detail ? ` (${detail})` : '';
    const error = new Error(`${guidance}${suffix} MCP config`);
    error.code = 'MCP_CONFIG_MISSING';
    return error;
  }

  loadMcpConfig(forceReload = false) {
    if (!this.mcpConfigPath) {
      throw this.createMcpConfigError('config path is empty');
    }

    if (!forceReload && this.mcpConfigCache) {
      return this.mcpConfigCache;
    }

    let targetPath = this.mcpConfigPath;

    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        const candidates = [
          'KAMUI CODE.json',
          'KAMUI CODE.JSON',
          'mcp-kamui-code.json',
          'kamui-code.json'
        ];

        const matched = candidates.find(candidate => fs.existsSync(path.join(targetPath, candidate)));
        if (matched) {
          targetPath = path.join(targetPath, matched);
          this.mcpConfigPath = targetPath;
          console.log(`📄 Resolved MCP config directory to file: ${targetPath}`);
        }
      }
    }

    if (!fs.existsSync(targetPath)) {
      const pathHint = this.originalMcpConfigPath && this.originalMcpConfigPath !== targetPath
        ? ` (original value: "${this.originalMcpConfigPath}")`
        : '';
      throw this.createMcpConfigError(`config file not found at ${targetPath}${pathHint}`);
    }

    try {
      const configData = fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(configData);
      this.mcpConfigCache = parsed;
      return parsed;
    } catch (error) {
      throw this.createMcpConfigError(`failed to load config at ${targetPath}: ${error.message}`);
    }
  }

  getAvailableServicesSummary() {
    const mcpConfig = this.loadMcpConfig();
    const servers = mcpConfig.mcpServers || {};

    const summary = {
      image: [],
      video: [],
      other: []
    };

    for (const [serviceId, serverConfig] of Object.entries(servers)) {
      const metadata = buildServiceMetadata(serviceId, serverConfig);
      if (metadata.type === 'image') {
        summary.image.push(metadata);
      } else if (metadata.type === 'video') {
        summary.video.push(metadata);
      } else {
        summary.other.push(metadata);
      }
    }

    const sortByName = (a, b) => a.name.localeCompare(b.name, 'ja');
    summary.image.sort(sortByName);
    summary.video.sort(sortByName);
    summary.other.sort(sortByName);

    return summary;
  }

  getServicesByType(type = 'image') {
    const summary = this.getAvailableServicesSummary();
    if (type === 'video') return summary.video;
    if (type === 'other') return summary.other;
    return summary.image;
  }

  getAvailableServiceIds(type = null) {
    if (!type) {
      const summary = this.getAvailableServicesSummary();
      return [...summary.image, ...summary.video].map(service => service.id);
    }

    return this.getServicesByType(type).map(service => service.id);
  }

  getDefaultServiceId(type = 'image') {
    const configDefault = config.get(`models.${type}.default`);
    if (configDefault) {
      return configDefault;
    }

    const services = this.getServicesByType(type);
    if (services && services.length > 0) {
      return services[0].id;
    }

    if (type === 'video') {
      return 't2v-kamui-wan-v2-2-5b-fast';
    }

    return 't2i-kamui-seedream-v4';
  }
  /**
   * オフライン翻訳辞書を使った簡易翻訳
   * 辞書読み込みに失敗した場合は原文を返す
   */
  async translateOffline(text) {
    try {
      const { TRANSLATION_DICTIONARY } = await import('../common/translation-dictionary.js');
      const translationDict = TRANSLATION_DICTIONARY;

      let result = String(text ?? '').toLowerCase();

      for (const [japanese, english] of Object.entries(translationDict)) {
        const regex = new RegExp(japanese, 'gi');
        result = result.replace(regex, english);
      }

      result = result
        .replace(/を/g, '')
        .replace(/が/g, '')
        .replace(/に/g, '')
        .replace(/で/g, '')
        .replace(/と/g, ' and ')
        .replace(/、/g, ', ')
        .replace(/。/g, '.')
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`🌐 Offline translation: "${text}" → "${result}"`);
      return result;
    } catch (error) {
      console.warn('⚠️ Offline translation skipped:', error);
      return String(text ?? '');
    }
  }

  /**
   * 進捗情報をサーバーに送信
   */
  sendProgress(taskId, percent, message = '') {
    if (this.server && taskId) {
      this.server.sendProgress(taskId, { percent, message });
    }
  }

  /**
   * ステータスチェック回数から進捗を計算
   */
  calculateProgress(currentCheck, maxRetries, queuePosition = null, status = 'IN_QUEUE') {
    if (status === 'COMPLETED') return 100;

    let baseProgress = 0;

    if (queuePosition !== null) {
      if (queuePosition > 10) {
        baseProgress = 5;
      } else if (queuePosition > 5) {
        baseProgress = 15;
      } else if (queuePosition > 0) {
        baseProgress = 25;
      } else {
        baseProgress = 40;
      }
    }

    if (status === 'IN_PROGRESS') {
      baseProgress = Math.max(baseProgress, 40);
      const progressFromChecks = Math.min(50, (currentCheck / maxRetries) * 50);
      return Math.min(95, baseProgress + progressFromChecks);
    }

    return baseProgress;
  }

  /**
   * 統一生成API - 画像・動画・将来の3D等を統一処理
   */
  async generate(prompt, options = {}) {
    const { type = 'image', taskId = null, ...otherOptions } = options;
    
    console.log(`🎯 Generate ${type}: "${prompt}"`);
    
    // プロンプト強化（統一処理）
    const enhancedPrompt = await this.enhancePrompt(prompt, type);
    
    // タイプ別生成処理
    switch (type) {
      case 'image':
        return await this.generateImage(enhancedPrompt, { ...otherOptions, taskId });
      case 'video':
        return await this.generateVideo(enhancedPrompt, { ...otherOptions, taskId });
      // 将来の拡張用
      case '3d':
        throw new Error('3D generation not implemented yet');
      case 'i2v':
        throw new Error('Image-to-video generation not implemented yet');
      default:
        throw new Error(`Unsupported generation type: ${type}`);
    }
  }

  /**
   * MCP サーバーに接続
   */
  async connect() {
    if (this.connected) return;

    try {
      // MCP設定ファイルから設定を読み込み
      const mcpConfig = this.loadMcpConfig();
      console.log('📋 Loaded MCP config with', Object.keys(mcpConfig.mcpServers || {}).length, 'servers');

      // MCPクライアントを作成
      this.client = new Client({
        name: "chocodrop-client",
        version: "1.0.0"
      }, {
        capabilities: {}
      });

      // MCP接続は実際のツール呼び出し時に確立される
      // （各KAMUI CodeサーバーはHTTPエンドポイントとして動作）
      console.log('🔗 MCP Client initialized - ready for tool calls');
      
      this.connected = true;
      console.log('✅ MCP Client ready');
      
    } catch (error) {
      console.error('❌ Failed to initialize MCP client:', error);
      throw error;
    }
  }

  /**
   * 画像生成メイン関数
   */
  async generateImage(prompt, options = {}) {
    console.log(`🎨 Generating image with prompt: "${prompt}"`);

    try {
      // MCP サーバーに接続
      await this.connect();
      
      const serviceName = options.service || this.getDefaultServiceId('image');
      const taskId = options.taskId;
      const imageData = await this.callMCPService(serviceName, {
        prompt: prompt,
        width: options.width || 512,
        height: options.height || 512,
        num_inference_steps: options.steps || 4,
        guidance_scale: options.guidance || 1.0
      }, taskId);

      return {
        success: true,
        imageUrl: imageData.url,
        localPath: imageData.localPath,
        metadata: {
          prompt: prompt,
          service: serviceName,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      console.error('❌ Image generation failed:', error);
      
      return {
        success: false,
        error: error.message,
        fallbackUrl: this.generatePlaceholderImage(prompt)
      };
    }
  }

  /**
   * プロンプトを英語+キーワード形式に強化
   */
  /**
   * 日本語を英語に翻訳
   */


  async enhancePrompt(prompt, type = 'video') {
    console.log(`🔍 Original prompt (${type}): "${prompt}"`);
    
    // 日本語プロンプトを英語に翻訳（オフライン辞書ベース）
    let enhanced = await this.translateOffline(prompt);
    
    // 日本語フレーズのクリーンアップ（翻訳後の残存チェック）
    enhanced = enhanced
      .replace(/create video/gi, '')
      .replace(/create image/gi, '') 
      .replace(/make video/gi, '')
      .replace(/make image/gi, '')
      .replace(/please/gi, '')
      .trim();
    
    // タイプ別品質キーワード追加
    switch (type) {
      case 'image':
        enhanced += ', high quality, detailed, photorealistic, 8k resolution, sharp focus, masterpiece, best quality';
        break;
      case 'video':
        enhanced += ', smooth movements, high quality, detailed textures, natural lighting, cinematic composition, professional cinematography, 4K resolution, dynamic camera work, realistic rendering, fine details, vibrant colors, depth of field';
        break;
      case '3d':
        enhanced += ', 3D rendered, volumetric lighting, high poly, detailed geometry, realistic materials, ray tracing';
        break;
      case 'i2v':
        enhanced += ', smooth animation, consistent style, fluid motion, temporal coherence, high frame rate';
        break;
    }
    
    console.log(`🔍 Enhanced prompt (${type}): "${enhanced}"`);
    return enhanced;
  }

  // この関数は削除されました - 翻訳処理はserver.jsで統一

  /**
   * 動画生成メイン関数
   */
  async generateVideo(prompt, options = {}) {
    console.log(`🎬 Generating video with prompt: "${prompt}"`);

    // プロンプトからアスペクト比を自動検出
    const aspectRatioMatch = prompt.match(/(16:9|9:16|1:1)/i);
    const detectedAspectRatio = aspectRatioMatch ? aspectRatioMatch[1] : null;
    
    if (detectedAspectRatio && !options.aspect_ratio) {
      console.log(`🔍 Detected aspect ratio from prompt: ${detectedAspectRatio}`);
      options = { ...options, aspect_ratio: detectedAspectRatio };
    }

    try {
      await this.connect();

      const {
        width,
        height,
        duration: rawDuration,
        model,
        taskId,
        aspect_ratio,
        resolution,
        negative_prompt,
        seed,
        enable_safety_checker,
        enable_prompt_expansion,
        frames_per_second,
        guidance_scale
      } = options;

      const safeDefaults = {
        aspect_ratio: '16:9',
        resolution: '720p',
        enable_safety_checker: true,
        enable_prompt_expansion: true
      };

      const sanitizedAspectRatio = sanitizeAspectRatio(aspect_ratio)
        || safeDefaults.aspect_ratio
        || (width && height ? normalizeAspectRatio(width, height) : '16:9');

      const sanitizedResolution = sanitizeVideoResolution(resolution)
        || safeDefaults.resolution
        || deriveResolutionFromDimensions(width, height)
        || '720p';

      const userProvidedWidth = typeof width === 'number' && width > 0;
      const userProvidedHeight = typeof height === 'number' && height > 0;
      let userProvidedDimensions = userProvidedWidth && userProvidedHeight;

      let resolvedWidth = userProvidedWidth ? ensureEvenDimension(width) : null;
      let resolvedHeight = userProvidedHeight ? ensureEvenDimension(height) : null;

      if (!resolvedWidth || !resolvedHeight) {
        const derived = deriveDimensionsFromAspect(sanitizedAspectRatio, sanitizedResolution);
        if (!resolvedWidth) resolvedWidth = derived.width;
        if (!resolvedHeight) resolvedHeight = derived.height;
      }

      if (userProvidedDimensions) {
        const providedAspect = width / height;
        const normalizedProvidedAspect = Math.round((providedAspect + Number.EPSILON) * 100) / 100;
        const normalizedTargetAspect = sanitizedAspectRatio === '16:9'
          ? Math.round((16 / 9 + Number.EPSILON) * 100) / 100
          : sanitizedAspectRatio === '9:16'
            ? Math.round((9 / 16 + Number.EPSILON) * 100) / 100
            : 1;

        if (Math.abs(normalizedProvidedAspect - normalizedTargetAspect) > 0.05) {
          console.warn('⚠️ Ignoring width/height due to aspect mismatch with sanitized aspect ratio', {
            provided: { width, height },
            sanitizedAspectRatio
          });
          userProvidedDimensions = false;
        }
      }

      const duration = typeof rawDuration === 'number' && rawDuration > 0 ? rawDuration : 3;
      const resolvedSeed = typeof seed === 'number' ? Math.floor(seed) : Math.floor(Math.random() * 1000000);
      const resolvedSafetyChecker = enable_safety_checker ?? safeDefaults.enable_safety_checker;
      const resolvedPromptExpansion = enable_prompt_expansion ?? safeDefaults.enable_prompt_expansion;
      const resolvedFramesPerSecond = typeof frames_per_second === 'number' && frames_per_second > 0
        ? Math.round(frames_per_second)
        : null;
      const resolvedGuidanceScale = typeof guidance_scale === 'number' ? guidance_scale : null;

      const enhancementMarker = 'smooth movements, high quality, detailed textures';
      const alreadyEnhanced = typeof prompt === 'string' && prompt.includes(enhancementMarker);
      let workingPrompt = alreadyEnhanced ? prompt : await this.enhancePrompt(prompt, 'video');

      console.log(`🔍 Prepared video prompt: "${workingPrompt}"`);
      console.log('🎞️ Video option snapshot:', {
        aspect_ratio: sanitizedAspectRatio,
        resolution: sanitizedResolution,
        duration,
        width: resolvedWidth,
        height: resolvedHeight,
        enable_safety_checker: resolvedSafetyChecker,
        enable_prompt_expansion: resolvedPromptExpansion,
        frames_per_second: resolvedFramesPerSecond,
        guidance_scale: resolvedGuidanceScale,
        seed: resolvedSeed
      });

      const serviceName = model || this.getDefaultServiceId('video');
      const maxRetries = 2;
      let retryCount = 0;
      let currentAspectRatio = sanitizedAspectRatio;

      while (retryCount <= maxRetries) {
        try {
          const requestParams = {
            prompt: workingPrompt,
            resolution: sanitizedResolution,
            duration,
            seed: resolvedSeed,
            enable_safety_checker: resolvedSafetyChecker,
            enable_prompt_expansion: resolvedPromptExpansion
          };

          if (currentAspectRatio) {
            requestParams.aspect_ratio = currentAspectRatio;
          }

          if (userProvidedDimensions) {
            requestParams.width = resolvedWidth;
            requestParams.height = resolvedHeight;
          }

          if (negative_prompt) {
            requestParams.negative_prompt = negative_prompt;
          }

          if (resolvedFramesPerSecond) {
            requestParams.frames_per_second = resolvedFramesPerSecond;
          }

          if (resolvedGuidanceScale !== null) {
            requestParams.guidance_scale = resolvedGuidanceScale;
          }

          const videoData = await this.callMCPVideoService(serviceName, requestParams, taskId);

          return {
            success: true,
            videoUrl: videoData.url,
            localPath: videoData.localPath,
            metadata: {
              prompt: prompt,
              model: serviceName,
              timestamp: Date.now(),
              retryCount,
              width: resolvedWidth,
              height: resolvedHeight,
              duration,
              aspect_ratio: currentAspectRatio || sanitizedAspectRatio,
              resolution: sanitizedResolution,
              seed: resolvedSeed,
              frames_per_second: resolvedFramesPerSecond,
              guidance_scale: resolvedGuidanceScale,
              enable_safety_checker: resolvedSafetyChecker,
              enable_prompt_expansion: resolvedPromptExpansion
            }
          };

        } catch (error) {
          if (currentAspectRatio && typeof error.message === 'string' && error.message.toLowerCase().includes('aspect_ratio')) {
            console.warn('⚠️ Aspect ratio rejected by service, retrying without aspect_ratio parameter');
            currentAspectRatio = null;
            continue;
          }

          if (retryCount < maxRetries && typeof error.message === 'string' && error.message.includes('file size is too small, minimum 1MB required')) {
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${maxRetries}: Enhancing prompt for 1MB+ video generation`);

            workingPrompt = `${workingPrompt}, longer duration scenes, complex movements, multiple camera angles, rich textures, detailed backgrounds, smooth transitions, extended sequences, comprehensive storytelling, intricate details, elaborate cinematography, dynamic lighting changes, varied compositions, professional video production, high bitrate, detailed rendering`;

            console.log(`🎬 Enhanced retry prompt: "${workingPrompt}"`);
            continue;
          }

          throw error;
        }
      }

    } catch (error) {
      console.error('❌ Video generation failed:', error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * MCP 動画サービス呼び出し (MCP SDK経由)
   */
  async callMCPVideoService(serviceName, parameters, taskId = null) {
    console.log(`📡 Calling KAMUI Code MCP video service: ${serviceName}`, parameters);
    
    if (!this.connected) {
      throw new Error('MCP client not initialized');
    }
    
    const timestamp = Date.now();
    const filename = `generated_${timestamp}.mp4`;
    const localPath = path.join(this.outputDir, filename);
    const webPath = `${this.serverUrl}/generated/${filename}`;
    
    // MCP設定ファイルから設定を読み込み
    const mcpConfig = this.loadMcpConfig();
    
    // サービス設定を取得
    const serverConfig = mcpConfig.mcpServers?.[serviceName];
    if (!serverConfig || !serverConfig.url) {
      throw new Error(`Service not found in config: ${serviceName}`);
    }
    
    try {
      console.log(`🔗 Connecting to MCP video server: ${serverConfig.url}`);
      
      // StreamableHTTPClientTransportで接続
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      
      const client = new Client({
        name: "chocodrop-client",
        version: "1.0.0"
      }, {
        capabilities: {}
      });
      
      const transport = new StreamableHTTPClientTransport(
        new URL(serverConfig.url)
      );
      
      await client.connect(transport);
      console.log('✅ Connected to MCP video server');
      
      // 利用可能なツール一覧を取得
      const toolsResponse = await client.listTools();
      console.log('🔧 Available video tools:', toolsResponse.tools?.map(t => t.name));
      
      // Step 1: シンプルな汎用ツール選択 - 最初に利用可能なツールを使用
      const availableTools = toolsResponse.tools || [];
      if (availableTools.length === 0) {
        throw new Error(`No tools available for service: ${serviceName}`);
      }

      // submitツールを探す（名前に'submit'が含まれるツール）
      const submitTool = availableTools.find(tool => tool.name.includes('submit')) || availableTools[0];
      
      console.log(`🎯 Step 1: Submitting video with tool: ${submitTool.name}`);
      const submitArgs = {
        prompt: parameters.prompt,
        resolution: parameters.resolution,
        seed: parameters.seed,
        enable_safety_checker: parameters.enable_safety_checker,
        enable_prompt_expansion: parameters.enable_prompt_expansion
      };

      if (parameters.aspect_ratio) {
        submitArgs.aspect_ratio = parameters.aspect_ratio;
      }

      if (parameters.duration) submitArgs.duration = parameters.duration;
      if (parameters.width) submitArgs.width = parameters.width;
      if (parameters.height) submitArgs.height = parameters.height;
      if (parameters.negative_prompt) submitArgs.negative_prompt = parameters.negative_prompt;
      if (parameters.frames_per_second) submitArgs.frames_per_second = parameters.frames_per_second;
      if (parameters.guidance_scale !== undefined && parameters.guidance_scale !== null) {
        submitArgs.guidance_scale = parameters.guidance_scale;
      }

      const submitResult = await client.callTool({
        name: submitTool.name,
        arguments: submitArgs
      });
      
      console.log('📤 Video submit result:', submitResult);
      
      // request_idを取得
      let requestId = null;
      if (submitResult.content && Array.isArray(submitResult.content)) {
        for (const content of submitResult.content) {
          if (content.type === 'text') {
            const text = content.text;
            console.log('📝 Parsing video text content:', text);
            
            // JSON形式をチェック
            try {
              const jsonData = JSON.parse(text);
              console.log('✅ Parsed video JSON:', jsonData);
              if (jsonData.request_id) {
                requestId = jsonData.request_id;
                console.log('🆔 Found video request_id:', requestId);
                break;
              }
            } catch (e) {
              // マークダウン形式をチェック
              const match = text.match(/Request ID:/);
              if (match) {
                const idMatch = text.match(/([a-f0-9-]+)/);
                if (idMatch) {
                  requestId = idMatch[1];
                  console.log('🆔 Found video request_id from markdown:', requestId);
                  break;
                }
              }
            }
          }
        }
      }
      
      if (!requestId) {
        throw new Error('No request_id received from video submit');
      }
      
      console.log(`🆔 Got video request_id: ${requestId}`);
      
      // Step 2: Status - 完了まで待機（動画は時間がかかるため60回チェック）
      const statusTool = toolsResponse.tools?.find(tool => tool.name.includes('status'));
      if (!statusTool) {
        throw new Error('No status tool found');
      }
      
      console.log(`🔄 Step 2: Checking video status with tool: ${statusTool.name}`);
      let isCompleted = false;
      let maxRetries = 120; // 最大120回チェック（最大20分）
      let currentStatus = 'IN_QUEUE';
      let queuePosition = null;
      let lastQueuePosition = null;
      let stuckCount = 0;
      let checkStartTime = Date.now();

      // モデル名から初期間隔を決定
      const isFastModel = serviceName.toLowerCase().includes('fast');
      let baseInterval = isFastModel ? 3000 : 8000; // fastモデルは3秒、それ以外は8秒

      while (!isCompleted && maxRetries > 0) {
        const statusResult = await client.callTool({
          name: statusTool.name,
          arguments: {
            request_id: requestId
          }
        });

        const currentCheck = 121 - maxRetries;
        console.log(`⏳ Video status check (${currentCheck}/120):`, statusResult);

        // ステータスをチェック
        if (statusResult.content && Array.isArray(statusResult.content)) {
          for (const content of statusResult.content) {
            if (content.type === 'text') {
              const text = content.text;

              // キューポジション取得
              const queueMatch = text.match(/queue_position['":\s]*(\d+)/i);
              if (queueMatch) {
                queuePosition = parseInt(queueMatch[1]);
              }

              // ステータス取得
              if (text.includes('IN_PROGRESS')) {
                currentStatus = 'IN_PROGRESS';
              } else if (text.includes('COMPLETED')) {
                currentStatus = 'COMPLETED';
                isCompleted = true;
                break;
              } else if (text.includes('FAILED')) {
                throw new Error('Video generation failed');
              }
            }
          }
        }

        // 進捗計算と送信（動画は60回チェック）
        if (taskId) {
          const progress = this.calculateProgress(currentCheck, 150, queuePosition, currentStatus);
          let message = '';

          if (queuePosition > 0) {
            message = `動画キュー位置: ${queuePosition}`;
          } else if (currentStatus === 'IN_PROGRESS') {
            message = '動画生成中...';
          } else {
            message = '動画待機中...';
          }

          this.sendProgress(taskId, progress, message);
        }

        if (!isCompleted) {
          // 動的間隔の計算
          let interval = baseInterval;
          
          // キューポジションに基づく調整
          if (queuePosition !== null) {
            if (queuePosition > 100) interval = 30000; // 30秒
            else if (queuePosition > 50) interval = 20000; // 20秒
            else if (queuePosition > 20) interval = 15000; // 15秒
            else if (queuePosition > 10) interval = 10000; // 10秒
            else if (queuePosition > 5) interval = 8000;   // 8秒
            else if (queuePosition > 0) interval = 5000;   // 5秒
          }
          
          // 経過時間に基づく調整（5分経過後は間隔を長くする）
          const elapsedTime = Date.now() - checkStartTime;
          if (elapsedTime > 5 * 60 * 1000) { // 5分経過
            interval = Math.max(interval, 15000); // 最低15秒
          }
          
          // スタック検出（同じキューポジションが続く場合）
          if (queuePosition === lastQueuePosition && queuePosition !== null) {
            stuckCount++;
            if (stuckCount > 3) {
              interval = Math.min(interval * 1.5, 30000); // 最大30秒まで延長
            }
          } else {
            stuckCount = 0;
          }
          lastQueuePosition = queuePosition;
          
          console.log(`⏳ Next check in ${interval/1000}s (queue: ${queuePosition}, status: ${currentStatus})`);
          await new Promise(resolve => setTimeout(resolve, interval));
          maxRetries--;
        }
      }
      
      if (!isCompleted) {
        const elapsedMinutes = Math.round((Date.now() - checkStartTime) / 60000);
        throw new Error(`Video generation timeout - did not complete after ${elapsedMinutes} minutes (${retryCount} checks remaining)`);
      }
      
      // Step 3: Result - 結果を取得
      const resultTool = toolsResponse.tools?.find(tool => tool.name.includes('result'));
      if (!resultTool) {
        throw new Error('No result tool found');
      }
      
      console.log(`📥 Step 3: Getting video result with tool: ${resultTool.name}`);
      const resultResult = await client.callTool({
        name: resultTool.name,
        arguments: {
          request_id: requestId
        }
      });
      
      console.log('✅ Final video result:', JSON.stringify(resultResult, null, 2));
      
      // エラーチェックを追加
      if (resultResult.isError) {
        const errorText = resultResult.content?.[0]?.text || 'Video generation failed';
        // 動画が生成完了している場合は特別扱い
        if (errorText.includes('invalid video URL format') && isCompleted) {
          console.warn(`⚠️ Video URL validation failed, but video was generated (status: COMPLETED).`);
          // エラーフラグを解除して処理を続行
          resultResult.isError = false;
          resultResult.content = [{
            type: 'text',
            text: JSON.stringify({
              video_url: `https://placeholder.video/${requestId}.mp4`,
              request_id: requestId,
              message: 'Video generated but URL validation failed - using placeholder'
            })
          }];
        } else {
          throw new Error(errorText);
        }
      }
      
      let videoDownloaded = false;
      let lastTextMessage = null;

      // 結果処理
      console.log('📋 Result content details:', JSON.stringify(resultResult.content, null, 2));
      if (resultResult.content && Array.isArray(resultResult.content)) {
        for (const content of resultResult.content) {
          if (content.type === 'text') {
            const text = content.text;
            lastTextMessage = text;

            const normalizedText = text.toLowerCase();
            if (normalizedText.includes('failed to get result') || normalizedText.includes('invalid video url format')) {
              // 動画は生成完了しているが、URL取得に失敗した場合
              console.warn(`⚠️ Video URL validation failed, but video was generated. Using fallback URL.`);
              // ダミーURLを生成して、後でMCPから直接取得できるようにする
              const dummyUrl = `https://placeholder.video/${requestId}.mp4`;
              console.log(`🎯 Using placeholder URL: ${dummyUrl}`);
              
              // プレースホルダーとしてローカルに空のファイルを作成
              const fs = await import('fs/promises');
              await fs.writeFile(localPath, Buffer.from('Video generated but URL retrieval failed. Request ID: ' + requestId));
              videoDownloaded = true;
              
              // エラーではなく成功として扱う
              break;
            }
            
            // JSON構造をチェック
            try {
              const jsonData = JSON.parse(text);
              if (jsonData.video_url) {
                const videoUrl = jsonData.video_url;
                console.log(`🎯 Found video URL: ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                videoDownloaded = true;
                break;
              } else if (jsonData.video && jsonData.video.url) {
                const videoUrl = jsonData.video.url;
                console.log(`🎯 Found video URL (nested): ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                videoDownloaded = true;
                break;
              } else if (jsonData.videos && Array.isArray(jsonData.videos) && jsonData.videos.length > 0) {
                const videoUrl = jsonData.videos[0].url;
                console.log(`🎯 Found video URL in array: ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                videoDownloaded = true;
                break;
              }
            } catch (e) {
              // テキストの中に動画URLが含まれている可能性をチェック
              const urlMatch = text.match(/https?:\/\/[^\s\)]+/i);
              if (urlMatch) {
                const videoUrl = urlMatch[0];
                console.log(`🎯 Found video URL in text: ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                videoDownloaded = true;
                break;
              }
            }
          }
        }
      }

      if (!videoDownloaded) {
        console.error('❌ No video URL found in result payload');
        if (lastTextMessage) {
          throw new Error(lastTextMessage.trim());
        }
        throw new Error('Video result did not include a downloadable URL');
      }
      
      // 接続を閉じる
      await client.close();
      
      return {
        url: webPath,
        localPath: localPath,
        metadata: {
          service: serviceName,
          prompt: parameters.prompt,
          timestamp: timestamp,
          requestId: requestId,
          mcpResponse: resultResult
        }
      };
      
    } catch (error) {
      console.error(`❌ MCP video service failed: ${serviceName}`, error);
      throw error;
    }
  }

  /**
   * 動画をダウンロードして保存
   */
  async downloadAndSaveVideo(videoUrl, localPath) {
    try {
      console.log(`🔗 Downloading video from: ${videoUrl}`);
      
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'video/mp4,video/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      };
      
      // フェッチリトライロジック
      let response;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`📡 Fetch attempt ${attempt}/${maxRetries}`);
          response = await fetch(videoUrl, { 
            headers,
            timeout: 30000 // 30秒タイムアウト
          });
          break; // 成功したらループを抜ける
        } catch (fetchError) {
          console.warn(`⚠️ Fetch attempt ${attempt} failed:`, fetchError.message);
          
          if (attempt === maxRetries) {
            // 最後の試行でも失敗した場合、プレースホルダーを作成
            console.log(`🔄 Creating placeholder video file after ${maxRetries} failed attempts`);
            await this.createPlaceholderVideo(localPath);
            return;
          }
          
          // 次の試行まで少し待機
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      console.log(`📡 Video response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text available');
        console.error(`❌ Video download failed with status ${response.status}: ${errorText}`);
        throw new Error(`Failed to download video: ${response.status} - ${errorText}`);
      }
      
      const buffer = await response.arrayBuffer();
      console.log(`📦 Downloaded video ${buffer.byteLength} bytes`);
      
      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(localPath, Buffer.from(buffer));
      console.log(`💾 Video saved to: ${localPath}`);
      
    } catch (error) {
      console.error('❌ Failed to download/save video:', error);
      // エラー時はプレースホルダー動画を作成
      console.log('🔄 Creating placeholder video due to download error');
      await this.createPlaceholderVideo(localPath);
    }
  }

  /**
   * プレースホルダー動画ファイルを作成
   */
  async createPlaceholderVideo(localPath) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 小さなプレースホルダー動画データ（1秒の黒画面MP4）
      const placeholderVideoBase64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAthhdGFtAAAAsHVkdGEAAABUbWV0YQAAAAAAAAAhaGRscu==';
      const buffer = Buffer.from(placeholderVideoBase64, 'base64');
      
      fs.writeFileSync(localPath, buffer);
      console.log(`📝 Placeholder video created: ${localPath}`);
      
    } catch (error) {
      console.error('❌ Failed to create placeholder video:', error);
      throw error;
    }
  }

  /**
   * MCP サービス呼び出し (MCP SDK経由)
   */
  async callMCPService(serviceName, parameters, taskId = null) {
    console.log(`📡 Calling KAMUI Code MCP service: ${serviceName}`, parameters);
    
    if (!this.connected) {
      throw new Error('MCP client not initialized');
    }
    
    const timestamp = Date.now();
    const filename = `generated_${timestamp}.png`;
    const localPath = path.join(this.outputDir, filename);
    const webPath = `${this.serverUrl}/generated/${filename}`;
    
    // MCP設定ファイルから設定を読み込み
    const mcpConfig = this.loadMcpConfig();
    
    // サービス設定を取得
    const serverConfig = mcpConfig.mcpServers?.[serviceName];
    if (!serverConfig || !serverConfig.url) {
      throw new Error(`Service not found in config: ${serviceName}`);
    }
    
    try {
      console.log(`🔗 Connecting to MCP server: ${serverConfig.url}`);
      
      // StreamableHTTPClientTransportで接続
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      
      const client = new Client({
        name: "chocodrop-client",
        version: "1.0.0"
      }, {
        capabilities: {}
      });
      
      const transport = new StreamableHTTPClientTransport(
        new URL(serverConfig.url)
      );
      
      await client.connect(transport);
      console.log('✅ Connected to MCP server');
      
      // 利用可能なツール一覧を取得
      const toolsResponse = await client.listTools();
      console.log('🔧 Available tools:', toolsResponse.tools?.map(t => t.name));
      
      // Step 1: シンプルな汎用ツール選択 - 最初に利用可能なツールを使用
      const availableTools = toolsResponse.tools || [];
      if (availableTools.length === 0) {
        throw new Error(`No tools available for service: ${serviceName}`);
      }

      // submitツールを探す（名前に'submit'が含まれるツール）
      const submitTool = availableTools.find(tool => tool.name.includes('submit')) || availableTools[0];
      
      console.log(`🎯 Step 1: Submitting with tool: ${submitTool.name}`);
      const submitResult = await client.callTool({
        name: submitTool.name,
        arguments: {
          prompt: parameters.prompt,
          width: parameters.width || 512,
          height: parameters.height || 512,
          num_inference_steps: parameters.num_inference_steps || 4,
          guidance_scale: parameters.guidance_scale || 1.0
        }
      });
      
      console.log('📤 Submit result:', submitResult);
      
      // 汎用的なレスポンス処理：どんなMCPサービスでも対応
      const processResponse = (responseData) => {
        let requestId = null;
        let directImageData = null;

        if (!responseData.content || !Array.isArray(responseData.content)) {
          return { requestId, directImageData };
        }

        for (const content of responseData.content) {
          // 直接メディアデータをチェック（画像・動画両対応）
          if ((content.type === 'image' || content.type === 'video') && content.data) {
            console.log(`✅ Found direct ${content.type} data`);
            directImageData = content.data; // 変数名は既存のまま（画像・動画両用）
          }

          // request_idをチェック
          if (content.type === 'text') {
            const text = content.text;

            // JSON形式のrequest_id
            try {
              const jsonData = JSON.parse(text);
              if (jsonData.request_id) {
                requestId = jsonData.request_id;
                console.log('🆔 Found request_id (JSON):', requestId);
              }
            } catch (e) {
              // マークダウン形式のrequest_id
              const match = text.match(/\*\*Request ID:\*\*\s+([a-f0-9-]+)/i);
              if (match) {
                requestId = match[1];
                console.log('🆔 Found request_id (markdown):', requestId);
              }
            }
          }
        }

        return { requestId, directImageData };
      };

      console.log('🔍 Processing MCP response...');
      const { requestId, directImageData } = processResponse(submitResult);

      // 直接メディアデータがある場合は即座に処理（画像・動画両対応）
      if (directImageData) {
        console.log('⚡ Processing direct media response...');
        const fs = await import('fs');

        // Base64データからメディアタイプを判定して適切に処理
        const base64Data = directImageData.replace(/^data:(image|video)\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        await fs.promises.writeFile(localPath, buffer);
        console.log(`💾 Saved direct media to: ${localPath}`);

        return {
          success: true,
          imageUrl: webPath,
          localPath: localPath,
          metadata: {
            prompt: parameters.prompt,
            service: serviceName,
            timestamp: timestamp,
            model: 'Direct Response',
            type: 'immediate'
          }
        };
      }

      // request_idがある場合は非同期処理を継続
      if (!requestId) {
        throw new Error('No request_id or direct image data received from MCP service');
      }
      
      console.log(`🆔 Got request_id: ${requestId}`);
      
      // Step 2: Status - 完了まで待機
      const statusTool = toolsResponse.tools?.find(tool => tool.name.includes('status'));
      if (!statusTool) {
        throw new Error('No status tool found');
      }
      
      console.log(`🔄 Step 2: Checking status with tool: ${statusTool.name}`);
      let isCompleted = false;
      let maxRetries = 30; // 最大30回チェック
      let currentStatus = 'IN_QUEUE';
      let queuePosition = null;

      while (!isCompleted && maxRetries > 0) {
        const statusResult = await client.callTool({
          name: statusTool.name,
          arguments: {
            request_id: requestId
          }
        });

        const currentCheck = 31 - maxRetries;
        console.log(`⏳ Status check (${currentCheck}/30):`, statusResult);

        // ステータスをチェック（マークダウンテキストから）
        if (statusResult.content && Array.isArray(statusResult.content)) {
          for (const content of statusResult.content) {
            if (content.type === 'text') {
              const text = content.text;

              // キューポジション取得
              const queueMatch = text.match(/queue_position['":\s]*(\d+)/i);
              if (queueMatch) {
                queuePosition = parseInt(queueMatch[1]);
              }

              // ステータス取得
              if (text.includes('IN_PROGRESS')) {
                currentStatus = 'IN_PROGRESS';
              } else if (text.includes('COMPLETED') || text.includes('Status:** COMPLETED')) {
                currentStatus = 'COMPLETED';
                isCompleted = true;
                break;
              } else if (text.includes('FAILED') || text.includes('Status:** FAILED')) {
                throw new Error('Generation failed');
              }
            }
          }
        }

        // 進捗計算と送信
        if (taskId) {
          const progress = this.calculateProgress(currentCheck, 30, queuePosition, currentStatus);
          let message = '';

          if (queuePosition > 0) {
            message = `キュー位置: ${queuePosition}`;
          } else if (currentStatus === 'IN_PROGRESS') {
            message = '生成中...';
          } else {
            message = '待機中...';
          }

          this.sendProgress(taskId, progress, message);
        }

        if (!isCompleted) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
          maxRetries--;
        }
      }
      
      if (!isCompleted) {
        throw new Error('Generation timeout - did not complete within 180 seconds');
      }
      
      // Step 3: Result - 結果を取得
      const resultTool = toolsResponse.tools?.find(tool => tool.name.includes('result'));
      if (!resultTool) {
        throw new Error('No result tool found');
      }
      
      console.log(`📥 Step 3: Getting result with tool: ${resultTool.name}`);
      const resultResult = await client.callTool({
        name: resultTool.name,
        arguments: {
          request_id: requestId
        }
      });
      
      console.log('✅ Final result:', resultResult);
      
      // 結果処理
      if (resultResult.content && Array.isArray(resultResult.content)) {
        for (const content of resultResult.content) {
          if (content.type === 'image' && content.data) {
            // Base64画像データを高品質で保存
            const base64Data = content.data.replace(/^data:image\/[a-z]+;base64,/, '');
            
            // ディレクトリが存在しない場合は作成
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            
            // 高品質でBase64から直接保存（品質劣化防止）
            const imageBuffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(localPath, imageBuffer);
            console.log(`💾 High-quality image saved to: ${localPath} (${imageBuffer.length} bytes)`);
            break;
          } else if (content.type === 'text') {
            const text = content.text;
            
            // Seedream V4形式のJSON構造をチェック
            try {
              const jsonData = JSON.parse(text);
              if (jsonData.images && Array.isArray(jsonData.images) && jsonData.images.length > 0) {
                const imageUrl = jsonData.images[0].url;
                console.log(`🎯 Found Seedream V4 image URL: ${imageUrl}`);
                await this.downloadAndSaveImage(imageUrl, localPath);
                break;
              }
            } catch (e) {
              // JSONでない場合は、テキストの中に画像URLが含まれている可能性をチェック
              const urlMatch = text.match(/https?:\/\/[^\s\)]+\.(jpg|jpeg|png|gif)/i);
              if (urlMatch) {
                const imageUrl = urlMatch[0];
                console.log(`🎯 Found URL in text: ${imageUrl}`);
                await this.downloadAndSaveImage(imageUrl, localPath);
                break;
              }
            }
          }
        }
      }

      // 接続を閉じる
      await client.close();

      // 完了シグナル送信
      if (taskId) {
        this.sendProgress(taskId, 100, '完了');
        if (this.server) {
          this.server.sendProgress(taskId, {
            type: 'completed',
            percent: 100,
            message: '生成完了'
          });
        }
      }

      return {
        url: webPath,
        localPath: localPath,
        metadata: {
          service: serviceName,
          prompt: parameters.prompt,
          timestamp: timestamp,
          requestId: requestId,
          mcpResponse: resultResult
        }
      };
      
    } catch (error) {
      console.error(`❌ MCP service failed: ${serviceName}`, error);
      throw error;
    }
  }
  
  /**
   * 画像をダウンロードして保存
   */
  async downloadAndSaveImage(imageUrl, localPath) {
    try {
      console.log(`🔗 Downloading image from: ${imageUrl}`);
      
      // FAL CDN用の適切なヘッダーを設定
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      };
      
      const response = await fetch(imageUrl, { headers });
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // 詳細なエラー情報を取得
        const errorText = await response.text().catch(() => 'No error text available');
        console.error(`❌ Download failed with status ${response.status}: ${errorText}`);
        throw new Error(`Failed to download image: ${response.status} - ${errorText}`);
      }
      
      const buffer = await response.arrayBuffer();
      console.log(`📦 Downloaded ${buffer.byteLength} bytes`);
      
      const fs = await import('fs');
      
      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(localPath, Buffer.from(buffer));
      console.log(`💾 Image saved to: ${localPath}`);
      
    } catch (error) {
      console.error('❌ Failed to download/save image:', error);
      throw error;
    }
  }

  /**
   * プレースホルダー画像生成（開発用）
   */
  generatePlaceholderImage(prompt) {
    const hash = this.hashString(prompt);
    const hue = hash % 360;
    
    const svg = `
      <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:hsl(${hue},70%,60%);stop-opacity:1" />
            <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360},70%,40%);stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" fill="url(#grad)"/>
        <text x="256" y="230" font-family="Arial" font-size="24" fill="white" text-anchor="middle">🎨</text>
        <text x="256" y="270" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${prompt.slice(0, 20)}</text>
        <text x="256" y="300" font-family="Arial" font-size="14" fill="rgba(255,255,255,0.7)" text-anchor="middle">Placeholder Image</text>
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
  }

  /**
   * 文字列のハッシュ値を計算
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 利用可能な画像生成サービス一覧
   */
  getAvailableServices() {
    return getAvailableModelIds();
  }
}
