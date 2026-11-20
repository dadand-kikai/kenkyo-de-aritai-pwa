# 謙虚でありたい PWA

Android版「謙虚でありたい」の81問、出題ロジック、3択回答、週次振り返りを移植したPWAです。回答履歴はIndexedDBにだけ保存し、通知サーバーへは送りません。

## ローカル確認

Node.js 22以降で次を実行します。

```powershell
npm test
npm run serve
```

`http://127.0.0.1:4173` を開きます。通知はHTTPSの本番環境とOneSignal設定がそろってから利用できます。

## 構成

- ルート: Cloudflare Pagesへ置く静的PWA
- `worker/`: 通知設定API、15分ごとの配信、D1マイグレーション
- `docs/`: 設計、公開、運用、インストール、費用、テスト資料

公開作業は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。
