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

### Icebergは、ソフトウェア？DB？　結局どこに出てくるの？

**Icebergは、動いているサーバーではなく、「ファイルの並べ方のルール」と、それを実装した部品です。** Parquetが「ファイルの形式」であって、動くソフトではないのと同じです。

登場人物ごとに、どれがIcebergなのかを分けるとこうなります。

```
ユーザー
 └ エンジン（Spark / Flink / DuckDB など）
     │   ← Icebergのライブラリを内蔵している（★）
     ├ カタログ（Glue / Polaris など） … 最新のmetadata.jsonの場所を持つ
     └ ストレージ（S3 / ADLS2 など）
         ★ ここに並んでいるファイル群の形と意味が、Iceberg
           metadata.json / manifest list / manifest / Parquet（＋delete file）
```

Icebergが具体的に出てくるのは、次の4か所です。

1. **ストレージ上のファイルの形と意味**: metadata.json、manifest list、manifestに、何を書くか。スナップショット、スキーマ、パーティション定義をどう表すか。
2. **エンジンに組み込まれたライブラリ**: エンジンがそのルールに従ってファイルを読み書きするための部品。Flinkなら `iceberg-flink-runtime` というjar、FlinkのSQLで `'connector' = 'iceberg'` と書くと使われるのがこれです。
3. **書き込みの手順のルール**: 新しいファイルを書き、最後にカタログで最新を切り替える、という順序。
4. **RESTカタログの規格**: エンジンとカタログが話すHTTP APIの決まり。これもIcebergプロジェクトが定めています。

逆に、**Icebergではないもの**は、エンジンそのもの（Spark、Flink、DuckDB）、カタログの実体（Glue、Polaris）、ストレージ（S3、ADLS2）、データ本体の形式（Parquet）です。Icebergは、これらの間の「約束事」の役割を担っています。だから、エンジンが違っても、同じルールに従っていれば同じテーブルを扱えます。

Spark、Flink、Trino、DuckDBなどの「エンジン」が、この仕様に従ってファイルを読み書きします。（本編の第3話で扱います）

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

### クエリを投げると、カタログはどう関わるの？　場所をユーザーに返すの？

**カタログが場所を返す相手は、ユーザーではなくエンジン（DuckDB、Spark、Flinkなど）です。** ユーザーには、クエリの結果が返ります。

```
ユーザー   SELECT * FROM midori.sales
   │
   ▼
エンジン ① カタログに聞く「midori.sales の最新は？」 → 「metadata/00002-….json です」
         ② そのmetadata.jsonを読む（スキーマ、今のスナップショット、manifest listの場所）
         ③ manifest list → manifest をたどり、読むべきParquetだけを選ぶ
         ④ Parquetを読んで、結果を計算する
   │
   ▼
ユーザー   結果の行が返る（カタログの存在は意識しない）
```

「これはIcebergのテーブルだ」という判断は、次のように行われます。Glueのように、Iceberg以外の形式（Hiveなど）のテーブルも同居するカタログでは、テーブルに「Icebergのテーブルです」という印が付いています（公式実装の説明に基づくもので、この教材の中ではまだ確かめていません）。エンジンはその印を見て、**自分に組み込まれたIcebergのライブラリ**で、metadata.jsonを読みに行きます。「ファイルの持ち方のルール」そのものは、カタログではなく、エンジン側のライブラリが知っています。

ユーザーがカタログを意識するのは、エンジンの設定に「どのカタログを使うか」（接続先のURIなど）を書くときだけです。

書き込みのときは向きが逆になります。エンジンが新しいmetadata.jsonを先にストレージへ書き、そのあとカタログに「最新を`00002`から`00003`に切り替えて」と頼みます。このとき、エンジンが見ていた版と今の最新が食い違っていれば、カタログは断ります（前の項目の実演のとおりです）。

### 「最新」は1個なのに、なぜカタログはこんなに種類が多いの？

**カタログの核は、「最新のmetadata.jsonの場所を持つ」ことと「食い違う書き込みを断る」ことだけで、どのカタログでも同じです。** 種類が多いのは、その1行を**どこに、どう持つか**と、**核に加えて何を足すか**が違うからです。

| カタログ | 「最新の場所」の持ち方 |
|---|---|
| SQL（JDBC）カタログ | RDBのテーブルの1行（前の項目で見たSQLite） |
| Hive Metastore | Hive Metastoreのテーブル情報に、`metadata_location`という属性として持つ |
| AWS Glue | Glueのテーブル情報に、`metadata_location`という属性として持つ |
| RESTカタログ（Polarisなど） | サーバーの裏側でどう持つかは実装次第。エンジンは、HTTP APIを通して聞くだけ |

（Hive MetastoreとGlueの持ち方は、Icebergの公式実装の説明に基づくもので、この教材の中ではまだ手を動かして確かめていません）

核以外に、実装ごとに次のようなものが足されます。

- **認証・権限管理**（誰がどのテーブルを読み書きしてよいか）
- **ストレージへの一時的な認証情報の発行**（Polarisなど。エンジンにストレージの鍵を渡さずに済む）
- **どのクラウド・どのエンジンとの相性が良いか**（歴史的な経緯もあります）

エンジン側から見ると、カタログごとに接続のやり方が違うと不便です。そこで、**接続の仕方をHTTP APIとして統一した規格がRESTカタログ**で、次の項目で説明します。

### RESTカタログって何？　「カタログ」とは別物？　Glueとは別物？

**別物ではなく、カタログの種類の1つです。** 言葉が指している層が違うので、混ざりやすいところです。

- **カタログ**: 「テーブル名 → 最新のmetadata.jsonの場所」を持つ、という**役割**のこと
- **Glue、Hive Metastore、SQL、REST**: その役割を実現する**種類**（実装）

種類の違いは、**エンジンがそのカタログに問い合わせるときの話し方**の違いでもあります。

| 種類 | エンジンの問い合わせ方 |
|---|---|
| Glueカタログ | AWSのGlue APIを直接呼ぶ |
| Hive Metastore | Hive Metastore専用のプロトコルで話す |
| SQL（JDBC） | RDBに直接つないで、SQLを発行する |
| **RESTカタログ** | **決められたHTTP APIで話す** |

RESTカタログは、この最後の「話し方」を**共通の規格として決めたもの**です。この規格に従っているサーバーなら、エンジンは相手がどこの製品でも同じ話し方で問い合わせられます。

既に知っているものでいうと、**S3互換API**に近いです。S3 APIという共通の話し方があるから、AWSのS3でも、MinIOでも、同じクライアントで使えます。RESTカタログの規格も、「カタログ版のS3互換API」のようなものです。

- 規格に従ったサーバーの例: Apache Polaris、Unity Catalogなど
- 自前で使うなら、この規格に応えるサーバーを立てる必要があります（Glueは、AWSが裏側を管理しているので、Glueとして使う限りは不要です）

つまり、「エンジンが問い合わせるときに使うのがRESTカタログ」というのは、**RESTカタログを選んだ場合の話**です。Glueを選べば、エンジンはGlue APIで問い合わせます。

### 認証や権限管理（RBAC）は、カタログによって使えたり使えなかったりするの？

**はい、カタログによって違います。** Icebergの仕様は「テーブルの形」と「カタログとの話し方」を決めていますが、**誰がどのテーブルを触ってよいか（権限管理）の中身までは決めていません。** そこは、各カタログが独自に持っています。

| カタログ | 権限管理の考え方 |
|---|---|
| SQL（JDBC） | カタログ自体には権限管理が無い。RDBにつなげる人と、ストレージに触れる人が、事実上何でもできる |
| Hive Metastore | 標準では細かい権限管理を持たず、Rangerなど別の仕組みを足すことが多い |
| AWS Glue | AWSのIAM。より細かくするならLake Formationを併用する |
| Apache Polaris | 自前のRBAC（ユーザー、ロール、カタログ単位の権限）を持つ。ストレージへの一時的な認証情報の発行も行う（筆者が実機で確認） |
| Unity Catalog、Snowflake | それぞれ独自のガバナンス機能を持つ |

（Polaris以外は、公式の説明に基づくもので、この教材の中ではまだ確かめていません）

設計で見落としやすいのは、**カタログが権限管理を持っていても、エンジンがストレージに直接触れる権限を持っていれば、カタログを経由せずにファイルを読めてしまう**ことです。カタログの権限管理を本当に効かせるなら、エンジンにストレージの鍵を渡さず、カタログが発行する一時的な認証情報だけで触らせる作りにする必要があります。これは上流工程で決めるべきポイントです。

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
