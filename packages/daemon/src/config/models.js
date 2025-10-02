/**
 * 画像生成モデル設定
 * モデルの一元管理と簡単な切り替えを可能にする
 */

// 利用可能なモデル一覧
export const MODELS = {
  // 高速・軽量（推奨：プロトタイピング用）
  QWEN_IMAGE: {
    id: 't2i-kamui-qwen-image',
    name: 'Qwen Image',
    description: '高速生成（1-2秒）、軽量だがやや品質劣る',
    speed: 'fast',
    quality: 'medium',
    timeout: 10000, // 10秒
    estimatedTime: '1-2秒'
  },
  
  // 高品質（推奨：本格利用）
  SEEDREAM_V4: {
    id: 't2i-kamui-seedream-v4',
    name: 'Seedream V4',
    description: '高品質・詳細（10-15秒）、写実的で鮮明',
    speed: 'medium',
    quality: 'high',
    timeout: 30000, // 30秒
    estimatedTime: '10-15秒'
  },
  
  // 最高品質（推奨：最終成果物用）
  FLUX_SCHNELL: {
    id: 't2i-kamui-flux-schnell',
    name: 'Flux Schnell',
    description: '最高品質（15-20秒）、非常に詳細',
    speed: 'slow',
    quality: 'highest',
    timeout: 40000, // 40秒
    estimatedTime: '15-20秒'
  },
  
  // 高品質バランス型
  IMAGEN4_FAST: {
    id: 't2i-kamui-imagen4-fast',
    name: 'Imagen4 Fast',
    description: '高品質・高速バランス型',
    speed: 'medium',
    quality: 'high',
    timeout: 25000, // 25秒
    estimatedTime: '8-12秒'
  },
  
  IMAGEN4_ULTRA: {
    id: 't2i-kamui-imagen4-ultra',
    name: 'Imagen4 Ultra',
    description: '最高品質Google Imagen4（15-20秒）',
    speed: 'slow',
    quality: 'highest',
    timeout: 40000, // 40秒
    estimatedTime: '15-20秒'
  },
  
  GEMINI_25_FLASH: {
    id: 't2i-kamui-gemini-25-flash-image',
    name: 'Gemini 2.5 Flash',
    description: 'Google最新モデル（8-12秒）',
    speed: 'medium',
    quality: 'high',
    timeout: 25000, // 25秒
    estimatedTime: '8-12秒'
  },
  
  // 特殊用途モデル
  DREAMINA_V31: {
    id: 't2i-kamui-dreamina-v31',
    name: 'Dreamina v3.1',
    description: 'ByteDance最新（10-15秒）、アニメ・イラスト特化',
    speed: 'medium',
    quality: 'high',
    timeout: 30000, // 30秒
    estimatedTime: '10-15秒'
  },
  
  FLUX_KREA_LORA: {
    id: 't2i-kamui-flux-krea-lora',
    name: 'Flux Krea LoRA',
    description: 'FLUX LoRA特化（12-18秒）、スタイル強化',
    speed: 'medium',
    quality: 'high',
    timeout: 35000, // 35秒
    estimatedTime: '12-18秒'
  },
  
  IDEOGRAM_CHARACTER: {
    id: 't2i-kamui-ideogram-character-base',
    name: 'Ideogram Character',
    description: 'キャラクター一貫性特化（8-12秒）',
    speed: 'medium',
    quality: 'high',
    timeout: 25000, // 25秒
    estimatedTime: '8-12秒'
  },
  
  IMAGEN3: {
    id: 't2i-kamui-imagen3',
    name: 'Imagen 3',
    description: 'Google Imagen 3（10-15秒）、高品質',
    speed: 'medium',
    quality: 'high',
    timeout: 30000, // 30秒
    estimatedTime: '10-15秒'
  },
  
  WAN_V2_2_A14B: {
    id: 't2i-kamui-wan-v2-2-a14b',
    name: 'WAN v2.2-a14b',
    description: 'WAN最新（8-12秒）、リアル志向',
    speed: 'medium',
    quality: 'high',
    timeout: 25000, // 25秒
    estimatedTime: '8-12秒'
  },
  
  NANO_BANANA: {
    id: 't2i-kamui-nano-banana',
    name: 'Nano Banana',
    description: '軽量高速（3-5秒）、実験的',
    speed: 'fast',
    quality: 'medium',
    timeout: 15000, // 15秒
    estimatedTime: '3-5秒'
  },
  
  // Text-to-Video Models
  WAN_V2_2_5B_FAST_VIDEO: {
    id: 't2v-kamui-wan-v2-2-5b-fast',
    name: 'WAN v2.2-5b FastVideo',
    description: '超高速動画生成（15-30秒）、T2V特化',
    speed: 'fast',
    quality: 'high',
    type: 'video',
    timeout: 60000, // 60秒
    estimatedTime: '15-30秒'
  },
  
  VEO3_FAST_VIDEO: {
    id: 't2v-kamui-veo3-fast',
    name: 'Veo3 Fast',
    description: 'Google Veo3高速動画生成（20-40秒）、多言語対応',
    speed: 'fast',
    quality: 'high',
    type: 'video',
    timeout: 80000, // 80秒
    estimatedTime: '20-40秒'
  }
};

// デフォルトモデル設定
export const DEFAULT_MODEL = MODELS.SEEDREAM_V4; // 高品質・鮮明画像

// 用途別推奨モデル
export const RECOMMENDED = {
  // プロトタイピング・テスト用
  PROTOTYPE: MODELS.QWEN_IMAGE,
  
  // 通常利用・デモ用
  GENERAL: MODELS.SEEDREAM_V4,
  
  // 最終成果物・プレゼン用
  PRODUCTION: MODELS.FLUX_SCHNELL
};

// キーワードベースの自動選択
export const AUTO_SELECT = {
  '高速': MODELS.QWEN_IMAGE,
  '高品質': MODELS.FLUX_SCHNELL,
  '詳細': MODELS.FLUX_SCHNELL,
  'プロトタイプ': MODELS.QWEN_IMAGE,
  'テスト': MODELS.QWEN_IMAGE
};

/**
 * モデルIDからモデル情報を取得
 */
export function getModelById(modelId) {
  return Object.values(MODELS).find(model => model.id === modelId) || DEFAULT_MODEL;
}

/**
 * 利用可能なモデルID一覧を取得
 */
export function getAvailableModelIds() {
  return Object.values(MODELS).map(model => model.id);
}

/**
 * コマンドから適切なモデルを自動選択
 */
export function selectModelFromCommand(command) {
  const lowerCommand = command.toLowerCase();

  for (const [keyword, model] of Object.entries(AUTO_SELECT)) {
    if (lowerCommand.includes(keyword)) {
      return model;
    }
  }

  return DEFAULT_MODEL;
}

// Legacy exports for compatibility with distribution version
export const models = Object.values(MODELS).map(model => ({
  id: model.id,
  name: model.name,
  type: model.type || (model.id.includes('t2v') ? 't2v' : 't2i'),
  provider: 'kamui-code'
}));

export const defaultModels = {
  t2i: DEFAULT_MODEL.id,
  t2v: MODELS.WAN_V2_2_5B_FAST_VIDEO.id
};

/**
 * 現在の環境設定
 */
export const CONFIG = {
  // 現在のデフォルトモデル
  currentDefault: DEFAULT_MODEL,
  
  // 環境別設定
  development: MODELS.QWEN_IMAGE,    // 開発時は高速
  production: MODELS.SEEDREAM_V4     // 本番は高品質
};