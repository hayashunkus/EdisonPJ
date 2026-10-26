# EdisonPJ Treasure Hunt Prototype

愛知県の街歩き型宝探しゲームのスマホWebプロトタイプです。探索エリア選択、距離シミュレーション、クイズ、手がかり、南京錠の画面を備えています。位置・距離・鍵番号はデモ値です。

## ディレクトリ構成

```text
EdisonPJ/
├─ index.html          # Viteが配信するHTML
├─ src/
│  ├─ main.jsx         # Reactの起動処理とCSS読み込み
│  ├─ App.jsx          # アプリ画面・動作
│  └─ style.css        # Tailwind CSSと全体の基本スタイル
├─ legacy/
│  └─ app.js           # 旧版（現在は使用しない）
├─ package.json        # 起動・ビルドコマンドと依存関係
├─ tailwind.config.js  # Tailwindの対象ファイル設定
├─ postcss.config.js   # CSSビルド設定
└─ PLAN.md             # 今後のAPI連携計画
```

`node_modules/` はインストールした依存関係、`dist/` は本番ビルドの出力先です。どちらも自動生成されます。

## 起動

React版の画面は `src/App.jsx`、起動処理は `src/main.jsx` です。`index.html` を直接開くのではなく、プロジェクトのルート（`package.json` があるフォルダー）で以下を実行してください。

```sh
npm install
npm run dev
```

表示されたURL（通常は `http://localhost:5173`）にアクセスしてください。ReactモジュールとTailwind CSSはVite経由で読み込まれるため、`index.html` を直接開くと正しく表示されません。

本番ビルドは `npm run build` で `dist/` に出力されます。旧バージョンの `legacy/app.js` は現在の画面では使用していません。

## API接続
詳細は `PLAN.md` を参照。Google MapsキーにはHTTPリファラー/API制限を設定してください。Geminiキーはフロントエンドに書かず、Pythonバックエンドの環境変数で管理します。
