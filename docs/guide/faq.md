# よくある疑問

Icebergを学ぶ途中で、実際に多くの人（筆者を含む）が詰まる疑問を集めています。本編のストーリーの途中でも「ここでこう思いませんか？」として出てきますが、あとから引けるように一覧にしています。

::: warning 草稿と確認状況
- 「筆者が実機で確認」と書いた項目は、筆者が別プロジェクト（Azure上のFlink＋Polaris＋Iceberg）で実際に動かして確かめたものです。
- 何も書いていない項目は、公式ドキュメントと一般的な知識に基づく説明で、この教材の中ではまだ手を動かして確かめていません。順次、確認して更新します。
:::

## ファイル形式（Parquet）

### Parquetファイルは、なぜ一度書いたら書き換えられないの？

「絶対に不可能」ではなく、**1つの値を直すためにファイル全体を作り直さないと辛い作り**になっています。列ごとにまとめて圧縮していて、各列の位置や統計がファイル末尾のフッターにまとまっているため、1つ値を変えると後ろの位置が全部ずれるからです。加えて、S3などのオブジェクトストレージも、部分的な書き換えを持たず、置き換えは丸ごとです。詳しくは[第1話](/guide/01-monday-morning)の実際にファイルを開いて確かめた節を参照してください。（筆者が実機のファイルで確認）

## Iceberg そのもの

### Icebergは、ソフトウェア？DB？　結局何なのか

**テーブルの「仕様」（テーブルフォーマット）です。** DBのような、常駐して動くサーバーではありません。
Spark、Flink、Trino、DuckDBなどの「エンジン」が、この仕様に従ってファイルを読み書きします。エンジンが違っても、同じ仕様に従っていれば同じテーブルを扱えるのがポイントです。（本編の第3話で扱います）

### IcebergはDatabricksのもの？

いいえ。Apache Software Foundationのオープンソースプロジェクトです。もともとはNetflixで生まれ、Apacheに寄贈されました。
混乱しやすい理由は、2024年にDatabricksが、Icebergの創始者たちが作った会社（Tabular）を買収したことと、Databricks自身が別のテーブルフォーマット（Delta Lake）の発祥でもあることです。

## カタログ

### カタログって何をするもの？　「カタログ」という言葉がピンと来ない

**「カタログ」は、商品カタログのカタログではなく、図書館の蔵書目録（catalog）のカタログです。** 「本の題名を言えば、どの棚にあるかを教えてくれる」あれです。

Icebergのカタログも同じで、**「テーブル名 → 今の最新のmetadata.jsonの場所」を1行持っているだけ**です。それ以外は何も持っていません（テーブルのデータも、メタデータの中身も、すべてストレージ側のファイルです）。

既に知っているものでいうと、次のどれかに近いです。

| 近いもの | 対応 |
|---|---|
| DNS | 名前（`sales`）を引くと、場所（最新のmetadata.jsonのパス）が返る |
| gitのブランチ（`main`） | 「今の最新のコミットはどれか」を指す1つの参照 |
| AWS Glueデータカタログ | Glueを使ってきた人なら、それが「カタログ」の実物です。Icebergでは、その役割を「最新の場所を指すこと」に絞って考えます |

#### 実物を見てみる：カタログは、SQLiteの1行だった

pyicebergには、カタログの置き場をSQLiteにできる実装があります。これなら、カタログの正体をそのまま目で見られます。

```bash
python3 -m venv .venv
.venv/bin/pip install "pyiceberg[sql-sqlite,pyarrow]"
mkdir -p warehouse
```

```python
# demo.py
import os
import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog

catalog = SqlCatalog("local", uri="sqlite:///catalog.db",
                     warehouse="file://" + os.path.abspath("warehouse"))
catalog.create_namespace("midori")
schema = pa.schema([("order_id", pa.int64()), ("amount", pa.int64())])
table = catalog.create_table("midori.sales", schema=schema)
table.append(pa.table({"order_id": [1, 2, 3], "amount": [100, 200, 400]}, schema=schema))
table.append(pa.table({"order_id": [4], "amount": [500]}, schema=schema))
```

```bash
.venv/bin/python demo.py
sqlite3 -header -column catalog.db "select table_namespace, table_name, metadata_location, previous_metadata_location from iceberg_tables;"
```

この環境での結果です（パスの前半は省略しています）。

| table_namespace | table_name | metadata_location | previous_metadata_location |
|---|---|---|---|
| midori | sales | …/metadata/**00002**-d8d2….metadata.json | …/metadata/**00001**-f928….metadata.json |

**カタログの中身は、たったこの1行です。** データを2回書き込んだので、`metadata` フォルダには `00000`（作成時）、`00001`（1回目の書き込み後）、`00002`（2回目）の3つのmetadata.jsonがあり、カタログは最新の `00002` を指しています。書き込みのたびに、この1行の指し先が新しい版に切り替わります。

#### 無いと、何が困るのか：2人が同時に書いたら？

ミドリマートで、2人が同時にsalesテーブルへ書き込む場面を再現します。

```python
# race.py
import os
import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog

catalog = SqlCatalog("local", uri="sqlite:///catalog.db",
                     warehouse="file://" + os.path.abspath("warehouse"))
schema = pa.schema([("order_id", pa.int64()), ("amount", pa.int64())])

writer_a = catalog.load_table("midori.sales")   # 2人とも「同じ最新版」を見ている
writer_b = catalog.load_table("midori.sales")

writer_a.append(pa.table({"order_id": [10], "amount": [1000]}, schema=schema))
writer_b.append(pa.table({"order_id": [20], "amount": [2000]}, schema=schema))
```

実行すると、次のメッセージが出ました。

```
Commit failed due to a concurrent update, retrying (1/4) in 101 ms
```

Bの1回目の書き込みは、**カタログに断られました。** 「Bが見ていた最新版」と「今の最新版」が、Aの書き込みで食い違っていたからです。Bは最新版を読み直して、もう一度やり直し、今度は成功しました。最終的に、AとBの両方の行がテーブルに入っています。

もしカタログが無く、フォルダを見に行くだけだったら、AとBは互いに気づかないまま、それぞれが「自分が最新」と思って書いてしまい、片方の書き込みが消えるかもしれません。**「今の最新はこれ、と1か所で決めて、食い違う書き込みは断る」のがカタログの仕事**です。

（筆者が実機で確認。pyiceberg 0.12.0、SQLiteカタログ。断られたあとの再試行は、pyicebergが自動で行いました）

### 「最新」は1個なのに、なぜカタログはこんなに種類が多いの？

ポインタ自体は1個ですが、次のような点が実装ごとに違います。

- **ポインタをどこに保存して、どう安全に切り替えるか**（Hive Metastore、AWSのGlue、RDB、独自のストアなど）
- **認証・権限管理を持つか**
- **どのクラウド・どのエンジンとの相性が良いか**（歴史的な経緯もあります）

代表的な実装には、Hive Metastore、AWS Glue、JDBC（RDB）、Nessie、REST（後述）などがあります。

### RESTカタログって何？　Glueとは別物？

**RESTカタログは、「エンジンがカタログと話すときのHTTP APIの形」を統一した規格です。** カタログごとに違っていた接続方法を、1つの共通のやり方にそろえるために作られました。

Glueを使うときは、AWSがカタログの裏側を管理してくれているので、自分でサーバーを立てる必要はありません。一方、RESTカタログを**自前で使う**なら、そのHTTP APIに応えるサーバーが必要です。それを実装したものが、次に出てくるPolarisです。

### PolarisとIcebergは何が違うの？　Polarisって何をデプロイするの？

- **Iceberg**: テーブルの仕様と、それを読み書きするライブラリ
- **Polaris**: RESTカタログの仕様を実装した**サーバー**（Javaで書かれたREST APIサーバー）

Kubernetes上に置くなら、特別なCRDは不要で、普通のDeployment + Serviceで動きます。（筆者が実機で確認）

### PolarisのAPIが2つあるって？

Polarisには、役割の違う2つのAPIがあります。

- **Iceberg REST API**（`/api/catalog`）: エンジン（Flink、Spark、DuckDBなど）が、テーブルを読み書きするときに使う
- **Management API**（`/api/management`）: カタログ、ユーザー、権限といった、Polaris自体の管理に使う

（筆者が実機で確認。Flinkの接続設定が指しているのは前者です）

## ツール

### pyicebergって何をするもの？　コマンドでテーブルを見るツール？

**Pythonのコードから、Icebergのテーブルを操作するためのライブラリです。** コマンドラインツールではありません。
なお、筆者が確認した時点（pyiceberg 0.12.0）では、「equality delete」という種類の削除情報を含むテーブルは読めません（既知の制限）。同じテーブルを、DuckDBのIceberg拡張では読めました。（筆者が実機で確認）
