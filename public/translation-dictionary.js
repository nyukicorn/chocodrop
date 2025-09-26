/**
 * ChocoDrop 共通翻訳辞書
 * サーバー・クライアント共通で使用する日本語→英語翻訳辞書
 */

const TRANSLATION_DICTIONARY = {
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
  '画像': 'image',
  '写真': 'photo',
  'イメージ': 'image',
  '絵': 'picture',
  'ファイル': 'file',
  'メディア': 'media',
  '素材': 'asset',
  '動画': 'video',
  'ビデオ': 'video',
  'ムービー': 'movie',
  '映像': 'video',
  'クリップ': 'clip',
  '猫': 'cat',
  'ネコ': 'cat',
  'ねこ': 'cat',
  '犬': 'dog',
  'イヌ': 'dog',
  'いぬ': 'dog',
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
  'はな': 'flower',
  'ハナ': 'flower',
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
  'やま': 'mountain',
  'ヤマ': 'mountain',
  '森': 'forest',
  '木': 'tree',
  'き': 'tree',
  'キ': 'tree',
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
  'しろ': 'castle',
  'シロ': 'castle',
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

  // 鳥類
  '鳥': 'bird',
  'とり': 'bird',
  'トリ': 'bird'
};

/**
 * オブジェクト識別用のエイリアス辞書（拡張版）
 * 翻訳辞書から逆マッピングを生成し、エイリアスも含める
 */
function createObjectKeywords() {
  const keywords = {};

  // 翻訳辞書から逆マッピングを作成
  for (const [japanese, english] of Object.entries(TRANSLATION_DICTIONARY)) {
    // 英語をキーとして日本語とエイリアスを格納
    if (!keywords[japanese]) {
      keywords[japanese] = [];
    }

    // 英語の翻訳を追加
    if (!keywords[japanese].includes(english)) {
      keywords[japanese].push(english);
    }
  }

  return keywords;
}

/**
 * 日本語キーワードを英語に翻訳
 */
function translateKeyword(japanese) {
  return TRANSLATION_DICTIONARY[japanese] || japanese;
}

/**
 * ファイル名と日本語キーワードをマッチング
 */
function matchKeywordWithFilename(keyword, filename, keywords) {
  const lowerFilename = filename.toLowerCase();

  // 直接マッチ
  if (lowerFilename.includes(keyword.toLowerCase())) {
    return true;
  }

  // キーワード辞書での相互マッチ
  for (const [jp, aliases] of Object.entries(keywords)) {
    // キーワードが日本語の場合、対応する英語エイリアスをファイル名で探す
    if (keyword.includes(jp)) {
      for (const alias of aliases) {
        if (lowerFilename.includes(alias.toLowerCase())) {
          return true;
        }
      }
    }
  }

  // 翻訳辞書での直接マッチ
  const englishKeyword = translateKeyword(keyword);
  if (englishKeyword !== keyword && lowerFilename.includes(englishKeyword.toLowerCase())) {
    return true;
  }

  return false;
}

// ES6 Modules (クライアント用)
export { TRANSLATION_DICTIONARY, createObjectKeywords, translateKeyword, matchKeywordWithFilename };

// CommonJS (サーバー用)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TRANSLATION_DICTIONARY, createObjectKeywords, translateKeyword, matchKeywordWithFilename };
}
