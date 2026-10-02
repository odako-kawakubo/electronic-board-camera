# 電子看板カメラ 保守・引継ぎガイド

## 目的
現場写真へ電子看板を焼き込むPWAです。撮影、保存写真閲覧、看板修正、既存写真への看板付与を行います。

## モジュール構成
- `js/app.js`: 起動・共有状態・共通UI
- `js/settings.js`: 設定・アプリ更新
- `js/photo-store.js`: IndexedDB保存
- `js/photo-utils.js`: 写真共通ルール
- `js/board.js`: 看板表示・編集・Canvas描画
- `js/camera.js`: カメラ起動・撮影・合成
- `js/photo-import.js`: 既存写真取込・途中再開
- `js/photo-viewer.js`: 写真閲覧・選択・削除・共有

## データで最重要の違い
- `baseDataUrl`: 看板を焼く前の元写真。看板修正に必要。
- `dataUrl`: 看板を焼き込んだ完成写真。閲覧・共有に使用。
- 正本はIndexedDB。`capturedPhotos`は起動時に正本から復元する画面側配列。

## 撮影フロー
`startCamera()` → `takePhoto()` → 元画像取得 → 看板合成 → 撮影確認 → `PhotoStore.savePhoto()` → `capturedPhotos`へ反映。保存失敗時は一覧へ追加しません。

## 看板仕様
位置は左下/右下/右上/左上。サイズ比率0.35〜0.55、初期0.45。調査は目視/施工前/施工中/施工後、サンプリングは施工前/施工中/施工後。断面は別区分で看板非表示。

## ファイル名
施工前=1、施工中=2、施工後=3、断面=4、目視=5。基本は `試料No-箇所No-区分.jpg`。重複時は `_02`, `_03` を付けます。

## IndexedDB
DB名 `electronic-board-camera-prototype`、version 2。storesは `photos` / `importSessions`。構造変更時は既存データを消さないマイグレーション必須。

## iPhone / PWA注意
バックグラウンド復帰後にカメラが止まる場合があるため復帰処理があります。新しいJS追加時は `index.html` の読込順と `service-worker.js` キャッシュ対象を両方更新します。inline onclickがあるため、安易なES modules化はしません。

## 修正方針
継ぎ足しパッチではなく、担当モジュールを確認して既存処理を整理して書き換えます。不要になった関数・定数・イベント・CSS・旧処理は残しません。

## 将来構想
OneDrive / SharePoint案件フォルダ読込、案件選択、写真直接送信、案件データから看板自動入力、将来的な「しらべ」連携。現段階では未実装です。
