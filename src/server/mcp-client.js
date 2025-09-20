import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DEFAULT_MODEL, getAvailableModelIds } from '../config/models.js';
import config from '../config/config.js';


/**
 * MCP Client - MCPサーバーとの通信を担当
 */
export class MCPClient {
  constructor(options = {}) {
    const configValue = config.get('mcp.configPath');
    const envValue = process.env.MCP_CONFIG_PATH;
    const fallbackConfigPath = path.join(os.homedir(), '.claude', 'mcp-kamui-code.json');
    this.mcpConfigPath =
      options.mcpConfigPath ||
      envValue ||
      configValue ||
      fallbackConfigPath;
    this.outputDir = options.outputDir || './public/generated';
    this.serverUrl = options.serverUrl || config.get('client.serverUrl');
    this.server = options.server || null;
    this.client = null;
    this.connected = false;
    

    
    console.log('🌉 MCPClient initialized with translation support');
  }
  /**
   * オフライン翻訳辞書
   * セキュアな配布のために外部依存を排除
   */
  translateOffline(text) {
    const translationDict = {
      // ファンタジー・魔法系
      'ユニコーン': 'unicorn',
      'ドラゴン': 'dragon',
      '龍': 'dragon',
      '怪獣': 'monster',
      'モンスター': 'monster',
      '魔法使い': 'wizard',
      '魔術師': 'sorcerer',
      '魔女': 'witch',
      '妖精': 'fairy',
      '🧚': 'fairy',
      '🧙': 'wizard',
      '魔法杖': 'magic wand',
      '杖': 'wand',
      'スタッフ': 'staff',
      '魔法': 'magic',
      '呪文': 'spell',
      '魔法陣': 'magic circle',
      '水晶玉': 'crystal ball',
      '薬瓶': 'potion bottle',
      '魔導書': 'grimoire',
      'フェニックス': 'phoenix',
      'グリフィン': 'griffin',
      'ペガサス': 'pegasus',
      'ケルベロス': 'cerberus',
      
      // 動物
      '猫': 'cat',
      '犬': 'dog',
      '狼': 'wolf',
      '熊': 'bear',
      'ライオン': 'lion',
      'トラ': 'tiger',
      '象': 'elephant',
      'キリン': 'giraffe',
      'シマウマ': 'zebra',
      'パンダ': 'panda',
      'ウサギ': 'rabbit',
      'リス': 'squirrel',
      'ハムスター': 'hamster',
      'フクロウ': 'owl',
      'ワシ': 'eagle',
      'カラス': 'crow',
      'ハト': 'dove',
      'ペンギン': 'penguin',
      'イルカ': 'dolphin',
      'クジラ': 'whale',
      'サメ': 'shark',
      'タコ': 'octopus',
      'カニ': 'crab',
      'エビ': 'shrimp',
      
      // 自然・風景
      '花': 'flower',
      '桜': 'cherry blossom',
      'バラ': 'rose',
      'ひまわり': 'sunflower',
      'チューリップ': 'tulip',
      '雲': 'cloud',
      '空': 'sky',
      '海': 'ocean',
      '湖': 'lake',
      '川': 'river',
      '山': 'mountain',
      '森': 'forest',
      '木': 'tree',
      '草原': 'meadow',
      '砂漠': 'desert',
      '滝': 'waterfall',
      '洞窟': 'cave',
      '島': 'island',
      '星座': 'constellation',
      '銀河': 'galaxy',
      '惑星': 'planet',
      
      // 建物・場所
      '城': 'castle',
      '宮殿': 'palace',
      '家': 'house',
      '塔': 'tower',
      '教会': 'church',
      '神殿': 'temple',
      '図書館': 'library',
      '学校': 'school',
      '病院': 'hospital',
      '駅': 'station',
      '空港': 'airport',
      '港': 'port',
      '橋': 'bridge',
      '灯台': 'lighthouse',
      '風車': 'windmill',
      '庭': 'garden',
      '公園': 'park',
      '遊園地': 'amusement park',
      
      // 乗り物
      '車': 'car',
      '電車': 'train',
      'バス': 'bus',
      '飛行機': 'airplane',
      'ヘリコプター': 'helicopter',
      '船': 'ship',
      'ヨット': 'yacht',
      '自転車': 'bicycle',
       'バイク': 'motorcycle',
      'ロケット': 'rocket',
      
      // 天体・時間
      '月': 'moon',
      '太陽': 'sun',
      '星': 'star',
      '彗星': 'comet',
      '流れ星': 'shooting star',
      '虹': 'rainbow',
      '雷': 'lightning',
      '雪': 'snow',
      '雨': 'rain',
      '嵐': 'storm',
      '霧': 'fog',
      '氷': 'ice',
      '火': 'fire',
      '水': 'water',
      '風': 'wind',
      '光': 'light',
      '影': 'shadow',
      '夜': 'night',
      '朝': 'morning',
      '夕方': 'evening',
      
      // 色・素材
      '赤': 'red',
      '青': 'blue',
      '緑': 'green',
      '黄色': 'yellow',
      '白': 'white',
      '黒': 'black',
      '紫': 'purple',
      'ピンク': 'pink',
      'オレンジ': 'orange',
      '茶色': 'brown',
      'グレー': 'gray',
      '金': 'gold',
      '銀': 'silver',
      'プラチナ': 'platinum',
      '銅': 'copper',
      '鉄': 'iron',
      '石': 'stone',
      '木材': 'wood',
      'ガラス': 'glass',
      '水晶': 'crystal',
      'ダイヤモンド': 'diamond',
      
      // 形容詞（外見・性質）
      '美しい': 'beautiful',
      '綺麗': 'beautiful',
      'きれい': 'beautiful',
      'かわいい': 'cute',
      '可愛い': 'cute',
      '愛らしい': 'adorable',
      'エレガント': 'elegant',
      '上品': 'elegant',
      '神秘的': 'mysterious',
      '謎めいた': 'mysterious',
      '幻想的': 'fantastical',
      'ファンタジー': 'fantasy',
      '魔法的': 'magical',
      'カッコいい': 'cool',
      'クール': 'cool',
      'セクシー': 'sexy',
      'かっこいい': 'cool',
      'おしゃれ': 'stylish',
      'スタイリッシュ': 'stylish',
      'モダン': 'modern',
      'レトロ': 'retro',
      'ビンテージ': 'vintage',
      
      // 形容詞（サイズ・形）
      '大きい': 'big',
      '巨大': 'gigantic',
      '巨大な': 'gigantic',
      '大きな': 'big',
      '小さい': 'small',
      '小さな': 'small',
      'ミニ': 'mini',
      'タイニー': 'tiny',
      '高い': 'tall',
      '低い': 'low',
      '背の高い': 'tall',
      '長い': 'long',
      '短い': 'short',
      '太い': 'thick',
      '細い': 'thin',
      '丸い': 'round',
      '四角い': 'square',
      '三角': 'triangular',
      'スリム': 'slim',
      '広い': 'wide',
      '狭い': 'narrow',
      '深い': 'deep',
      '浅い': 'shallow',
      
      // 形容詞（色彩・光）
      '明るい': 'bright',
      '暗い': 'dark',
      '輝く': 'shining',
      '光る': 'glowing',
      'キラキラ': 'sparkling',
      'ピカピカ': 'shiny',
      '透明': 'transparent',
      '半透明': 'translucent',
      'カラフル': 'colorful',
      'モノクロ': 'monochrome',
      '白黒': 'black and white',
      'パステル': 'pastel',
      'ネオン': 'neon',
      'メタリック': 'metallic',
      
      // 形容詞（時間・状態）
      '新しい': 'new',
      '古い': 'old',
      'アンティーク': 'antique',
      'ヴィンテージ': 'vintage',
      'フレッシュ': 'fresh',
      '若い': 'young',
      '老いた': 'aged',
      '成熟した': 'mature',
      '生きている': 'alive',
      '死んだ': 'dead',
      '元気': 'energetic',
      '疲れた': 'tired',
      '健康': 'healthy',
      '病気': 'sick',
      
      // 形容詞（速度・強度）
      '速い': 'fast',
      '早い': 'fast',
      '遅い': 'slow',
      '強い': 'strong',
      '弱い': 'weak',
      'パワフル': 'powerful',
      '力強い': 'powerful',
      'やわらかい': 'soft',
      '柔らかい': 'soft',
      '硬い': 'hard',
      '固い': 'hard',
      'ふわふわ': 'fluffy',
      'もこもこ': 'fluffy',
      'ツルツル': 'smooth',
      'ザラザラ': 'rough',
      'ネバネバ': 'sticky',
      
      // 形容詞（感情・雰囲気）
      '楽しい': 'fun',
      '面白い': 'interesting',
      'つまらない': 'boring',
      '悲しい': 'sad',
      '幸せ': 'happy',
      '嬉しい': 'joyful',
      '怒っている': 'angry',
      '驚いた': 'surprised',
      '恐ろしい': 'scary',
      '怖い': 'scary',
      '不気味': 'creepy',
      '平和': 'peaceful',
      '静か': 'quiet',
      'うるさい': 'noisy',
      '賑やか': 'lively',
      'ロマンチック': 'romantic',
      'ドラマチック': 'dramatic',
      
      // 形容詞（温度・天気）
      '冷たい': 'cold',
      '暖かい': 'warm',
      '熱い': 'hot',
      '涼しい': 'cool',
      '湿った': 'wet',
      '乾いた': 'dry',
      '濡れた': 'wet',
      '凍った': 'frozen',
      
      // 動詞・基本動作
      '飛ぶ': 'flying',
      '飛んでいる': 'flying',
      '舞う': 'dancing in air',
      '走る': 'running',
      '走っている': 'running',
      'ランニング': 'running',
      'ジョギング': 'jogging',
      '歩く': 'walking',
      '歩いている': 'walking',
      '散歩': 'walking',
      '泳ぐ': 'swimming',
      '泳いでいる': 'swimming',
      'ダイビング': 'diving',
      '潜る': 'diving',
      '登る': 'climbing',
      '降りる': 'descending',
      '跳ぶ': 'jumping',
      'ジャンプ': 'jumping',
      '滑る': 'sliding',
      'スケート': 'skating',
      'スキー': 'skiing',
      
      // 動詞・表現活動
      '踊る': 'dancing',
      '踊っている': 'dancing',
      'ダンス': 'dancing',
      '歌う': 'singing',
      '歌っている': 'singing',
      '演奏': 'playing music',
      '演奏する': 'playing music',
      'ピアノを弾く': 'playing piano',
      'ギターを弾く': 'playing guitar',
      '描く': 'drawing',
      '描いている': 'drawing',
      '絵を描く': 'painting',
      'ペイント': 'painting',
      '彫刻': 'sculpting',
      '写真を撮る': 'taking photos',
      '撮影': 'photographing',
      
      // 動詞・感情表現
      '笑う': 'smiling',
      '笑っている': 'smiling',
      'ニコニコ': 'smiling',
      '微笑む': 'smiling gently',
      '泣く': 'crying',
      '泣いている': 'crying',
      '叫ぶ': 'shouting',
      '囁く': 'whispering',
      '驚く': 'surprised',
      '怒る': 'angry',
      '喜ぶ': 'rejoicing',
      'ハグ': 'hugging',
      '抱きしめる': 'hugging',
      'キス': 'kissing',
      '手を振る': 'waving',
      
      // 動詞・日常活動
      '眠る': 'sleeping',
      '眠っている': 'sleeping',
      '寝る': 'sleeping',
      '休む': 'resting',
      '休憩': 'resting',
      'リラックス': 'relaxing',
      '座る': 'sitting',
      '座っている': 'sitting',
      '立つ': 'standing',
      '立っている': 'standing',
      '横になる': 'lying down',
      '食べる': 'eating',
      '食べている': 'eating',
      '飲む': 'drinking',
      '飲んでいる': 'drinking',
      '料理': 'cooking',
      '料理する': 'cooking',
      'クッキング': 'cooking',
      
      // 動詞・学習・作業
      '読む': 'reading',
      '読んでいる': 'reading',
      '勉強': 'studying',
      '勉強する': 'studying',
      '学ぶ': 'learning',
      '教える': 'teaching',
      '書く': 'writing',
      '書いている': 'writing',
      'タイピング': 'typing',
      '計算': 'calculating',
      '考える': 'thinking',
      '思考': 'thinking',
      '瞑想': 'meditating',
      '集中': 'concentrating',
      
      // 動詞・観察・知覚
      '見る': 'looking',
      '見ている': 'looking',
      '観察': 'observing',
      '見つめる': 'staring',
      '聞く': 'listening',
      '聞いている': 'listening',
      '匂いを嗅ぐ': 'smelling',
      '触る': 'touching',
      '感じる': 'feeling',
      '味わう': 'tasting',
      
      // 動詞・戦闘・魔法
      '戦う': 'fighting',
      '戦っている': 'fighting',
      'バトル': 'battling',
      '攻撃': 'attacking',
      '攻撃する': 'attacking',
      '守る': 'protecting',
      '守っている': 'protecting',
      '防御': 'defending',
      '魔法を使う': 'casting magic',
      '呪文を唱える': 'chanting spell',
      '魔法をかける': 'casting spell',
      '治療': 'healing',
      '治す': 'healing',
      '変身': 'transforming',
      '召喚': 'summoning',
      
      // 動詞・移動・旅行
      '旅行': 'traveling',
      '旅する': 'traveling',
      '冒険': 'adventuring',
      '探検': 'exploring',
      '探す': 'searching',
      '発見': 'discovering',
      '逃げる': 'escaping',
      '追いかける': 'chasing',
      '隠れる': 'hiding',
      'サーフィン': 'surfing',
      'ハイキング': 'hiking',
      'キャンプ': 'camping',
      
      // 動詞・創作・建設
      '作る': 'making',
      '作っている': 'making',
      '創造': 'creating',
      '建てる': 'building',
      '建設': 'constructing',
      '組み立てる': 'assembling',
      '修理': 'repairing',
      '直す': 'fixing',
      '壊す': 'breaking',
      '破壊': 'destroying',
      
      // 人物・基本
      '人': 'person',
      '人間': 'human',
      '男性': 'man',
      '女性': 'woman',
      '男': 'man',
      '女': 'woman',
      '男の子': 'boy',
      '女の子': 'girl',
      '子供': 'child',
      '子ども': 'child',
      '大人': 'adult',
      '赤ちゃん': 'baby',
      '老人': 'elderly person',
      'おじいさん': 'grandfather',
      'おばあさん': 'grandmother',
      '若者': 'young person',
      '青年': 'young man',
      '少女': 'young girl',
      '美人': 'beautiful woman',
      '美女': 'beautiful woman',
      'イケメン': 'handsome man',
      
      // 家族・関係
      '家族': 'family',
      '母': 'mother',
      '父': 'father',
      'お母さん': 'mother',
      'お父さん': 'father',
      'ママ': 'mom',
      'パパ': 'dad',
      '兄': 'older brother',
      '弟': 'younger brother',
      '姉': 'older sister',
      '妹': 'younger sister',
      '兄弟': 'brothers',
      '姉妹': 'sisters',
      '友達': 'friend',
      '友人': 'friend',
      '恋人': 'lover',
      'カップル': 'couple',
      '夫婦': 'married couple',
      
      // 職業・ファンタジー系
      '騎士': 'knight',
      '王子': 'prince',
      '王女': 'princess',
      '女王': 'queen',
      '王': 'king',
      '戦士': 'warrior',
      '冒険者': 'adventurer',
      '盗賊': 'thief',
      '忍者': 'ninja',
      'サムライ': 'samurai',
      '侍': 'samurai',
      'エルフ': 'elf',
      'ドワーフ': 'dwarf',
      'オーク': 'orc',
      '天使': 'angel',
      '悪魔': 'demon',
      
      // 職業・現代
      '医者': 'doctor',
      '看護師': 'nurse',
      '先生': 'teacher',
      '学生': 'student',
      '警察官': 'police officer',
      '消防士': 'firefighter',
      'パイロット': 'pilot',
      '運転手': 'driver',
      'コック': 'chef',
      '料理人': 'chef',
      'ウェイター': 'waiter',
      'ウェイトレス': 'waitress',
      '店員': 'shop clerk',
      'エンジニア': 'engineer',
      'プログラマー': 'programmer',
      'アーティスト': 'artist',
      '画家': 'painter',
      '歌手': 'singer',
      'ダンサー': 'dancer',
      'モデル': 'model',
      '俳優': 'actor',
      '女優': 'actress',
      'スポーツ選手': 'athlete',
      'サッカー選手': 'soccer player',
      '野球選手': 'baseball player',
      
      // 食べ物
      'ケーキ': 'cake',
      'クッキー': 'cookie',
      'パン': 'bread',
      'ピザ': 'pizza',
      'アイス': 'ice cream',
      'フルーツ': 'fruit',
      'りんご': 'apple',
      'いちご': 'strawberry',
      'バナナ': 'banana',
      
      // 服装・アクセサリー
      'ドレス': 'dress',
      '帽子': 'hat',
      '王冠': 'crown',
      'ティアラ': 'tiara',
      'ネックレス': 'necklace',
      '指輪': 'ring',
      '剣': 'sword',
      '盾': 'shield',
      '鎧': 'armor',
      'マント': 'cloak',
      'ローブ': 'robe',
      
      // 天気・自然現象
      '雷雨': 'thunderstorm',
      '竜巻': 'tornado',
      '火山': 'volcano',
      '地震': 'earthquake',
      'オーロラ': 'aurora',
      '日食': 'solar eclipse',
      '月食': 'lunar eclipse'
    };

    let result = text;
    
    // 辞書ベース翻訳（長い単語から優先的に処理）
    const sortedDict = Object.entries(translationDict).sort((a, b) => b[0].length - a[0].length);
    
    for (const [japanese, english] of sortedDict) {
      const regex = new RegExp(japanese, 'g');
      result = result.replace(regex, english);
    }
    
    // 基本的な文構造の処理
    result = result
      .replace(/の/g, ' ')
      .replace(/を/g, ' ')
      .replace(/が/g, ' ')
      .replace(/に/g, ' in ')
      .replace(/で/g, ' at ')
      .replace(/から/g, ' from ')
      .replace(/まで/g, ' to ')
      .replace(/と/g, ' and ')
      .replace(/、/g, ', ')
      .replace(/。/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`🌐 Offline translation: "${text}" → "${result}"`);
    return result;
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
      let mcpConfig = {};
      if (fs.existsSync(this.mcpConfigPath)) {
        const configData = fs.readFileSync(this.mcpConfigPath, 'utf8');
        mcpConfig = JSON.parse(configData);
        console.log('📋 Loaded MCP config with', Object.keys(mcpConfig.mcpServers || {}).length, 'servers');
      }

      // MCPクライアントを作成
      this.client = new Client({
        name: "chocodro-client",
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
      
      const serviceName = options.service || DEFAULT_MODEL.id;
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
    let enhanced = this.translateOffline(prompt);
    
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

    try {
      // MCP サーバーに接続
      await this.connect();

      // プロンプトを英語+キーワード形式に変換
      let enhancedPrompt = await this.enhancePrompt(prompt);
      console.log(`🔍 Original prompt: "${prompt}"`);
      console.log(`🔍 Enhanced prompt: "${enhancedPrompt}"`);

      const serviceName = options.model || 't2v-kamui-wan-v2-2-5b-fast';
      const taskId = options.taskId;

      // リトライロジック: 1MB未満エラーの場合は強化プロンプトで再試行
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const videoData = await this.callMCPVideoService(serviceName, {
            prompt: enhancedPrompt,
            aspect_ratio: "16:9",
            resolution: "720p",
            seed: Math.floor(Math.random() * 1000000)
          }, taskId);

          return {
            success: true,
            videoUrl: videoData.url,
            localPath: videoData.localPath,
            metadata: {
              prompt: prompt,
              model: serviceName,
              timestamp: Date.now(),
              retryCount: retryCount
            }
          };

        } catch (error) {
          if (retryCount < maxRetries && error.message.includes('file size is too small, minimum 1MB required')) {
            retryCount++;
            console.log(`🔄 Retry ${retryCount}/${maxRetries}: Enhancing prompt for 1MB+ video generation`);

            // プロンプトをさらに強化（長い、詳細な映像のためのキーワード追加）
            enhancedPrompt = enhancedPrompt + ', longer duration scenes, complex movements, multiple camera angles, rich textures, detailed backgrounds, smooth transitions, extended sequences, comprehensive storytelling, intricate details, elaborate cinematography, dynamic lighting changes, varied compositions, professional video production, high bitrate, detailed rendering';

            console.log(`🎬 Enhanced retry prompt: "${enhancedPrompt}"`);
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
    let mcpConfig = {};
    if (fs.existsSync(this.mcpConfigPath)) {
      const configData = fs.readFileSync(this.mcpConfigPath, 'utf8');
      mcpConfig = JSON.parse(configData);
    }
    
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
        name: "chocodro-client",
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
      
      // Step 1: Submit - リクエストを送信
      const submitTool = toolsResponse.tools?.find(tool => tool.name.includes('submit'));
      if (!submitTool) {
        throw new Error('No submit tool found');
      }
      
      console.log(`🎯 Step 1: Submitting video with tool: ${submitTool.name}`);
      const submitResult = await client.callTool({
        name: submitTool.name,
        arguments: {
          prompt: parameters.prompt,
          aspect_ratio: parameters.aspect_ratio,
          resolution: parameters.resolution,
          seed: parameters.seed
        }
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
      
      console.log('✅ Final video result:', resultResult);
      
      // エラーチェックを追加
      if (resultResult.isError) {
        throw new Error(resultResult.content?.[0]?.text || 'Video generation failed');
      }
      
      // 結果処理
      if (resultResult.content && Array.isArray(resultResult.content)) {
        for (const content of resultResult.content) {
          if (content.type === 'text') {
            const text = content.text;
            
            // JSON構造をチェック
            try {
              const jsonData = JSON.parse(text);
              if (jsonData.video_url) {
                const videoUrl = jsonData.video_url;
                console.log(`🎯 Found video URL: ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                break;
              } else if (jsonData.video && jsonData.video.url) {
                const videoUrl = jsonData.video.url;
                console.log(`🎯 Found video URL (nested): ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                break;
              } else if (jsonData.videos && Array.isArray(jsonData.videos) && jsonData.videos.length > 0) {
                const videoUrl = jsonData.videos[0].url;
                console.log(`🎯 Found video URL in array: ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                break;
              }
            } catch (e) {
              // テキストの中に動画URLが含まれている可能性をチェック
              const urlMatch = text.match(/https?:\/\/[^\s\)]+\.(mp4|avi|mov|webm)/i);
              if (urlMatch) {
                const videoUrl = urlMatch[0];
                console.log(`🎯 Found video URL in text: ${videoUrl}`);
                await this.downloadAndSaveVideo(videoUrl, localPath);
                break;
              }
            }
          }
        }
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
      
      const response = await fetch(videoUrl, { headers });
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
    let mcpConfig = {};
    if (fs.existsSync(this.mcpConfigPath)) {
      const configData = fs.readFileSync(this.mcpConfigPath, 'utf8');
      mcpConfig = JSON.parse(configData);
    }
    
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
        name: "chocodro-client",
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
      
      // Step 1: Submit - リクエストを送信
      const submitTool = toolsResponse.tools?.find(tool => tool.name.includes('submit'));
      if (!submitTool) {
        throw new Error('No submit tool found');
      }
      
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
      
      // request_idを取得（マークダウンまたはJSON形式から抽出）
      let requestId = null;
      console.log('🔍 Parsing submitResult:', JSON.stringify(submitResult, null, 2));
      
      if (submitResult.content && Array.isArray(submitResult.content)) {
        for (const content of submitResult.content) {
          if (content.type === 'text') {
            const text = content.text;
            console.log('📝 Parsing text content:', text);
            
            // JSON形式をチェック（Seedream V4など）
            try {
              const jsonData = JSON.parse(text);
              console.log('✅ Parsed JSON:', jsonData);
              if (jsonData.request_id) {
                requestId = jsonData.request_id;
                console.log('🆔 Found request_id:', requestId);
                break;
              }
            } catch (e) {
              console.log('❌ JSON parse failed:', e.message);
              // JSONでない場合は、マークダウン形式をチェック（Qwen Imageなど）
              const match = text.match(/\*\*Request ID:\*\*\s+([a-f0-9-]+)/i);
              if (match) {
                requestId = match[1];
                console.log('🆔 Found request_id from markdown:', requestId);
                break;
              }
            }
          }
        }
      }
      
      if (!requestId) {
        throw new Error('No request_id received from submit');
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
