# Docker Compose でセンシティブなメディアの検出を使う

[HanaMisskey/sensitive-detector](https://github.com/HanaMisskey/sensitive-detector) の公開イメージを、Misskey の外部検出サービスとして使えます。`compose_example.yml` と `compose.local-db.yml` の `sensitive-detector` は任意のサービスで、初期状態では無効です。

イメージは `main-0.0.2-hanami.26-afa0a9e` の digest に固定してあり、amd64 / arm64 に対応しています。モデルとヘルスチェックはイメージに含まれるため、モデルのダウンロードや volume の追加は不要です。

以下はリポジトリのルートで作業します。

## API キーの準備

```sh
cp .config/sensitive-detector.env.example .config/sensitive-detector.env
chmod 600 .config/sensitive-detector.env
```

`openssl rand -hex 32` などで生成した十分に長いランダムな値を、`.config/sensitive-detector.env` の `SENSITIVE_DETECTOR_API_KEY` に設定します。同じ値を後で Misskey の管理画面にも登録します。空のキーではサービスを起動できません。

`.config/sensitive-detector.env` は Git の追跡対象外です。キーを `.config/sensitive-detector.mjs` や Compose ファイルに書かないでください。

## Misskey も Compose で動かす場合

新規構築では `compose_example.yml` を `compose.yml` にコピーします。既存の `compose.yml` がある場合は上書きせず、次の設定を取り込みます。

`compose.yml` の次の 3 箇所で、行頭の `#` を外します。

1. `services.sensitive-detector` のブロック全体
2. `services.web.networks` の `sensitive_detector_network` 行
3. `networks.sensitive_detector_network` のブロック全体

`.config/default.yml` の `allowedPrivateNetworks` に、検出サービスの固定 IP アドレスだけを追加します。既存の設定がある場合は、そのリストに追記してください。

```yaml
allowedPrivateNetworks:
  - '10.253.255.2/32'
```

この設定は Misskey の HTTP 通信全般に適用されるため、`10.253.255.0/29` などネットワーク全体を許可しないでください。`10.253.255.0/29` が既存のネットワークと衝突する場合は、Compose の `subnet`、`ip_range`、`ipv4_address` と上記の `/32` を合わせて変更します。`ip_range` は `subnet` 内の自動割り当て範囲とし、検出サービスの固定 IP がその範囲に入らないようにします。

`.config/default.yml` に `proxy` を設定している場合は、既存の `proxyBypassHosts` リストに `sensitive-detector` を追加します。

```sh
docker compose up -d --wait
docker compose ps sensitive-detector
```

検出サービスは専用の内部ネットワークで `web` と通信し、ホストにはポートを公開しません。Misskey の接続先は `http://sensitive-detector:3009/` です。

## Misskey をホストで動かす場合

`compose.local-db.yml` の `services.sensitive-detector` ブロック全体で、行頭の `#` を外します。ポートは `127.0.0.1:3009` に公開されます。

`.config/default.yml` の `allowedPrivateNetworks` に次を追加します。既存の設定がある場合は、そのリストに追記してください。

```yaml
allowedPrivateNetworks:
  - '127.0.0.1/32'
```

`proxy` を設定している場合は、既存の `proxyBypassHosts` リストに `127.0.0.1` を追加します。

```sh
docker compose -f compose.local-db.yml up -d --wait
docker compose -f compose.local-db.yml ps sensitive-detector
```

`.config/default.yml` の変更後は、ホスト上の Misskey を再起動します。Misskey の接続先は `http://127.0.0.1:3009/` です。

## Misskey の管理画面

検出サービスが `healthy` になったら、管理画面の「セキュリティ」(`/admin/security`) →「センシティブなメディアの検出」で次を保存します。

- 判定サービスの接続先URL: 上記の構成に対応する接続先。`/v1/detect-images` は付けません。
- APIキー: `.config/sensitive-detector.env` に設定した値。
- 検出対象: 「ローカルのみ」または運用に合う対象。「なし」のままでは検出しません。

API URL と API キーは管理画面で設定し、`.config/default.yml` には追加しません。

起動時はモデルの読み込みに時間がかかります。`healthy` にならない場合は、使用した Compose コマンドの `up -d --wait` を `logs sensitive-detector` に置き換えてログを確認してください。メモリの上限は 2 GiB に設定しています。キーを変更した場合は検出サービスのコンテナを再作成し、管理画面のキーも更新します。
