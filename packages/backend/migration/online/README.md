# オンライン migration

`MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY=1` のとき、`manifest.json` に登録した
migration をオンライン実装へ置き換える。未登録の migration は元の実装を実行する。
SQL の自動変換は行わない。現時点の対象は BirthdayIndex1767169026317 のみ。

元の migration ファイルは編集しない。オンライン実装は同じ TypeORM migration 名と
timestamp を持つ単一のクラスを export する。ファイル名から履歴上の名前を推測しない。
通常実装ですでに適用された migration は再適用されない。

登録時は manifest の `migrations` に次の情報を追加する。

- `name`: 元のクラスの `name`（省略時はクラス名）と同じ TypeORM migration 名。
- `source`: 元ファイルの migration ディレクトリからの相対パス。
- `sourceSha256`: 元ファイルの SHA-256。上流変更で不一致になった場合は選択を停止する。
- `implementation`: オンライン実装の相対パス。
- `dependencies`: 実装が使う補助コードの相対パス。実行ハッシュに含める。
- `recoverableIndexes`: 取消・中断後に実装が修復できる索引の `schema.name`。

実装は up/down とも中断後に再開でき、元の実装と同じ最終スキーマへ到達させる。
索引の置換では、新しい索引の有効性を確認してから古い索引を削除する。
実装・依存コード・manifest エントリ・選択コードの変更は実行ハッシュを変える。

`pnpm revert` は最後の migration が `transaction = false` の場合のみ
TypeORM の revert トランザクションを外す。通常の migration の設定は維持する。

試験は PostgreSQL 18 の専用データベースを作成・削除する。
`MISSKEY_MIGRATION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54312/postgres pnpm --filter backend test:migrations`
で実行する。指定先には CREATE DATABASE 権限が必要。
