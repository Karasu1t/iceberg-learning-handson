# Iceberg 学習ハンズオン

Icebergは未経験だが、データ基盤の経験は多少ある人が、Icebergを使った設計・運用に**上流工程から**参画できるようになるための日本語教材です。Icebergのスペシャリストになることは目指していません。

- 機能の羅列ではなく、「なぜ必要か → 無いと困ること → 他の手段 → 既に知っているものだと何に近いか」のストーリーで説明します
- 手を動かして確かめた内容だけを書きます（確認していないことは明記します）
- 各章の最後に、設計時に決めることを置きます

## 読み方

### コンテナで見る

```bash
docker compose up --build
# http://localhost:8080 を開く
```

### 開発モード（Node.js 18以上）

```bash
npm install
npm run docs:dev
```

## 状態

草稿（第0〜1章）。章立ては [docs/guide/00-introduction.md](docs/guide/00-introduction.md) を参照。

## License

MIT
