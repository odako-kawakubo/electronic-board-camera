# 電子看板カメラ v50-board-render-unify

## 変更点

- サンプリング看板の「採取箇所名」を上下左右中央寄せに調整
- 案件名・住所のtextarea表示を上下左右中央寄せに再調整
- 保存時のCanvas看板でもサンプリング時の採取箇所名を中央寄せに変更
- v49c の看板修正フローは維持
- Service Worker cache を v50 に更新

## 確認URL

```text
?v=49d
```


## v50-board-render-unify

- 表示看板をCanvasプレビュー化し、保存・看板修正再合成と同じ drawBoardOnCanvas() を使うように統一。
- 表示用HTML/CSS看板は編集モード専用に変更。
- 案件名・住所・サンプリング時の採取箇所名の中央寄せ修正を維持。
- キャッシュ名も v50-board-render-unify に更新。
