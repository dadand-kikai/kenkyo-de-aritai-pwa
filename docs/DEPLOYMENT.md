# 公開手順

秘密鍵をGitやチャットへ貼らず、Cloudflare/OneSignalの管理画面とSecret機能だけで扱います。

## 1. OneSignal

1. OneSignalで新しいアプリを作り、Web Pushを選びます。
2. Site URLは最終的なCloudflare Pages URLを指定します。
3. OneSignal App IDを控えます。これは公開値です。
4. REST API Keyは後でCloudflare Worker Secretへ直接登録します。ソースや `config.js` へ書きません。

## 2. Cloudflare D1とWorker

Wranglerへログイン後、プロジェクトの `worker` フォルダーで実施します。

```powershell
npx wrangler login
npx wrangler d1 create kenkyo-notifications
```

返されたD1 database IDを `worker/wrangler.toml` の `database_id` に設定します。Pages URL、OneSignal App IDも同ファイルの公開変数へ設定します。

```powershell
npx wrangler d1 migrations apply kenkyo-notifications --remote
npx wrangler secret put ONESIGNAL_REST_API_KEY
npx wrangler deploy
```

表示された `workers.dev` URLを控えます。

## 3. PWA設定とPages

ルートの `config.js` に公開値だけを設定します。

```js
window.KENKYO_CONFIG = Object.freeze({
  apiBase: "https://kenkyo-notifications.アカウント名.workers.dev",
  oneSignalAppId: "OneSignal App ID"
});
```

Cloudflare PagesでGitHubリポジトリを接続し、Framework presetはNone、Build commandは `npm run build`、Build output directoryは `dist` を指定します。公開後、PagesのURLを `worker/wrangler.toml` の `ALLOWED_ORIGIN` と `APP_URL`、OneSignal Site URLへ反映し、Workerを再デプロイします。

## 4. 公開後の確認

1. `/api/health` が `{"ok":true}` を返すこと
2. manifestと2つのService Workerが200で取得できること
3. iPhone/Androidでホーム画面へ追加できること
4. 通知を15分後に設定し、閉じた状態で受信、タップ後に `#today` が開くこと
5. Worker LogsとD1でエラー、回答データの保存がないこと

有料プランへの変更は不要です。無料枠超過が予測された時点で、実測値と見積を提示して承認を得てから変更します。
