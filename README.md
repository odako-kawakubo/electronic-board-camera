# 電子看板カメラ v60

## 主な変更
- 通常表示写真をダブルタップ／ダブルクリックで拡大表示
- 看板編集時の「採取」を「サンプリング」へ変更
- 調査は青、サンプリングは緑で表示
- 「看板編集」の横に現在の看板種類を表示
- 看板の行高さを調整
  - 件名 52
  - 採取場所 40
  - 採取箇所／部屋No. 34
  - 試料No. 34
  - 区分 30
  - 日付 40
- 試料No.の箇所番号は `1` を下限とし、`1 ↔ 1-① ↔ 1-②` のように増減
- サンプリング時の採取箇所を矢印で補助増減
- `101`、`第2ビル 101`、英字、方角などを簡易判定
- `1-2階` などの範囲はセットで `1-2 → 2-3 → 3-4` と増減
- 判定できない表記は看板編集から手入力
- 編集完了ボタン、設定ボタン再押下で閉じる動作を維持


## v60
- 選択中写真を現在の横幅いっぱいに表示し、画像本来の縦横比で高さを自動調整
- 高さが画面を超える場合はプレビュー画面を縦スクロール可能に変更
- 部屋No.の初期文字サイズは試料No.と同じ24pxを維持
- 画面上のバージョン表示をv60に統一

## v60
- 看板編集内の「最初から」ボタン表記を「元に戻す」に変更
- 「戻る」「進む」のナビゲーションはそのまま維持
- v57で大きくなりすぎた選択中写真表示を、固定領域内の全体表示へ戻した


## v60 changes
- Moved case selector to the upper-left and reduced the photo counter size.
- Kept the selected image inside the available preview area without vertical overlap.
- Limited thumbnail scrolling to horizontal movement only.
- Added a per-field text-size reset button.
- Fixed board-edit completion so edited text and field text sizes are applied to the board and saved photo.
