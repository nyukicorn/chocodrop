# モニター所見

## 改善優先度
1. **メディア転送の帯域最適化**  
   `src/pwa/importer.js:93-119` では動画/GLBを data URL のまま送っているため、150MB 級ファイルで急激にメモリを消費します。Chunk 配送や ArrayBuffer 送信への移行を検討してください。
2. **XR側メディア管理UIの拡充**  
   `immersive.html:37-40` のステータス表示だけでは受信資産の削除や再配置ができません。`src/pwa/immersive.js` 側で受信一覧とクリーンアップ操作を提供すると評価が上がります。
3. **SceneManagerのリソース開放監視**  
   `SceneManager/index.js:417-445` の spawnAssetFromPayload で生成した texture/video リソースが蓄積しがちです。一定数超過時に `clearAssets()` を促すUIや自動解放ルールを設けると安定性が向上します。
