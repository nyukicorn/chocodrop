# 設定スキーマ概要（OPFS / 将来拡張）

## 1. 現行保存ファイル
| ファイル名 | 用途 | 備考 |
| --- | --- | --- |
| `session.json` | 直近のプロンプト、選択サービス、XR 起動時刻などを保存 | `pwa-bootstrap.js` の `saveSession` / `loadSession` |
| `models.json` | API で取得したモデル一覧のキャッシュ | オフライン時にドロップダウン復元 |
| `chocodrop-dev.log` | エラー・操作ログ | `appendLog` で追記。ユーザーが共有可能 |

### 1.1 `session.json` サンプル
```json
{
  "prompt": "美しい桜の森",
  "service": "default-image-model",
  "lastStatus": "success",
  "lastResponse": {
    "taskId": "task_1730361123_x7z",
    "assetUrl": "/generated/2025-10-30/sample.png"
  },
  "lastXRLaunchAt": "2025-10-31T20:55:12.000Z",
  "savedAt": "2025-10-31T20:55:15.000Z"
}
```

## 2. 取り込み型で追加予定のフィールド
| キー | 型 | 説明 |
| --- | --- | --- |
| `scenes` | 配列 | 取り込み済みシーンのリスト |
| `scenes[].id` | 文字列 | シーン識別子（slug） |
| `scenes[].source` | 文字列 | 取得元 URL またはローカルパス |
| `scenes[].type` | 文字列 | `gltf`, `scene-json`, `custom` など |
| `scenes[].camera` | オブジェクト | 初期カメラ設定（position, lookAt） |
| `scenes[].lastUsed` | ISO8601 | 最終アクセス日時 |
| `preferences` | オブジェクト | UI 表示設定、テーマ、XR 内 UI の位置など |
| `onboarding` | オブジェクト | チュートリアル完了フラグ等 |

### 2.1 拡張スキーマ案
```json
{
  "scenes": [
    {
      "id": "sample-room",
      "label": "サンプルルーム",
      "source": "https://example.com/sample-room.glb",
      "type": "gltf",
      "camera": {
        "position": [0, 1.6, 3.4],
        "lookAt": [0, 1.4, 0]
      },
      "lastUsed": "2025-10-31T21:05:00.000Z"
    }
  ],
  "preferences": {
    "theme": "dark",
    "uiPanel": {
      "position": [0.8, 1.4, -1.2],
      "scale": 0.9
    }
  },
  "onboarding": {
    "bookmarkletTutorialDone": true,
    "xrControlsTutorialDone": false
  }
}
```

## 3. 保存先の検討
- 短期: OPFS (`navigator.storage.getDirectory`) で完結。
- 中期: 必要に応じてクラウド同期（ユーザーアカウント連携、暗号化）を検討。
- 長期: 他プラットフォームとの連携時は、API 経由で設定を取得・保存する仕組み（GraphQL/REST）を整備。
