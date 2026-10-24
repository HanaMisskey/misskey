# PgDogのCI検証

backend単体・API/E2E・通常migration、frontend Playwright E2E、連合テストを、
PostgreSQL直結（`direct`）とPgDog経由（`pgdog`）のmatrixで実行する。
PgDogはv0.1.62のimage digestを固定し、transaction poolingで単一primaryへ接続する。
テスト本体・期待値は両経路で共通とし、CodeCovへは直結側の結果だけを送る。

backendとfrontendは`.github/actions/setup-pgdog`でDBの接続先を切り替える。
frontendは設定の再コピーを避けるため、backend packageの`start:test`で起動する。
連合テストは`compose.pgdog.yml`で各DBの前にPgDogを置く。
連合fixtureの検索provider指定は、既定のMeilisearch設定が欠けたまま起動に失敗することを避けるために必要。

online DDLの`test:migrations`はランダム名のDBを作成・破棄し、専用sessionでlockやcancelを操作するため、
既存の直結fixtureで1回だけ実行する。PgDog経由のonline DDLは未検証。
RKE2/CNPGの主系切替、切替中の投稿・queue・WebSocketの継続性、リードレプリカ併用は別途検証する。
