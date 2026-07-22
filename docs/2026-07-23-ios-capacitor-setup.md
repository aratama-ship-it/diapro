# iOS版 Capacitor導入メモ

作成日: 2026-07-23

## 方針

- Web版を正典として維持し、Capacitorで同じゲームをiOSの `WKWebView` に載せる。
- Web公開用のルート配置は変えない。
- `npm run build:web` でiOSへ渡すファイルだけを `www/` に同期する。
- `www/` と `node_modules/` は生成物なのでGit管理しない。
- `ios/` はXcode設定を含むためGit管理する。

## 暫定アプリ識別子

- App name: `ディアボロ選手育成`
- Bundle ID: `jp.aratama.diabolotrainer`

Bundle IDは開発用の暫定値。Apple DeveloperでApp IDを登録する前に、公開主体と正式名称を確認する。

## 日常の更新手順

```sh
npm test
npm run ios:sync
npm run ios:open
```

`ios:open` はXcodeを起動するため、このメモ作成時点では自動実行しない。

## 2026-07-23確認結果

- Node.js `22.17.0` / Xcode `26.6` を確認。
- Capacitor `8.4.2` を導入。
- `npm test`: 194件成功、失敗0件。
- `npm run build:web`: 65ファイル、約4.1MBを `www/` へ生成。
- `npx cap add ios` / `npx cap sync ios`: 成功。
- iPhone 17 Simulator向け署名なしDebugビルド: 成功（終了コード0）。
- 生成物: `App.app`、arm64、iOS 15以上、Bundle ID `jp.aratama.diabolotrainer`。
- Simulator起動QA: **未完了**。CoreSimulatorの初回データ移行後も `simctl install` が応答待ちになったため、画面起動は確認済みと扱わない。

iPhone版は縦画面を正とし、iPhoneの対応向きはPortraitだけに固定。iPadは生成時の全方向対応を維持している。

## 未確認・次工程

- iPhone実機でのセーフエリア、文字サイズ、タップ領域、共有シート、カード画像保存
- App icon / Launch screen
- Signing Team / Provisioning Profile
- Bundle IDとApp Store表示名の正式決定
- TestFlight Archive
