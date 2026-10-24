# PgDog経由のMisskey互換性検証

`hanami`向けPRと同ブランチへのpushでは、既存のDB利用テストを`direct`と`pgdog`のmatrixで比較する。
対象はbackend unit・API/E2E・通常migrationと残件検査、frontend Playwright E2E、連合テスト。
テスト本体・期待値・skip条件は共通で、PgDog側だけDB接続先を変更する。CodeCovへは直結側だけ送る。
通常のパス条件に加え、共有PgDog設定・依存lock・Node版の変更でも起動する。

PgDogはv0.1.62のmulti-platform image digestを固定し、transaction pooling、単一のprimary宛てとする。
backendとfrontendは`.github/actions/setup-pgdog`、連合は`compose.pgdog.yml`を使う。
CI専用の使い捨てDB・ユーザーであり、本番の認証・接続設定を持ち込まない。
連合fixtureには検索providerを明示し、Composeのdefault networkが固定internal networkと衝突しないsubnetを指定する。

`test:migrations`のonline DDL試験は、ランダム名のDBを作成・破棄し、専用sessionでlockやcancelを操作する。
この試験だけは既存の直結fixtureで1回実行する。PgDog経由のonline DDL互換性は、このCIでは未検証。
DBを使わないfrontend unitなどの既存jobは重複実行しない。

直結側の失敗もPgDog側の失敗も通常のjob失敗として残す。基準構成で観測した限定公開投稿の連合2件失敗や、
未使用の`test:browser`スクリプトの設定欠落を、skipや期待値変更で隠さない。
`test:browser`は既存workflowで実行されておらず、この変更でも追加しない。
CIは既存workflowの対象範囲であり、全package・全scriptを網羅する主張ではない。

これは単一PostgreSQLへの通常接続の互換性検査であり、RKE2/CNPG、主系切替、接続排出・待機、
WebSocket継続性、切替中の投稿・queueの欠落や重複、本番採用の受入は別途必要。
workflowの追加だけではbranch protectionの必須check設定は変わらない。

## 外部CSSの通信診断

`test-frontend.yml`を`workflow_dispatch`で`debug_browser=true`にすると、直結側の最初のページ表示テスト1件だけを実行する。
通常のPR/pushの全体テストは変更しない。この診断の成功を全11件の成功とは扱わない。
Chromium NetLogは既定の機密情報除去モード、Playwright traceは成功時も保持する。
テスト後に同じrunnerからIPv4/IPv6・HTTP/1.1/HTTP/2のcurl診断を実行し、個別の終了コード・接続時間・応答ヘッダーを保存する。
診断用artifactは成功・失敗にかかわらず7日保存する。再実行時のActions詳細ログは`gh run rerun --job JOB_ID --debug`で有効にできる。
