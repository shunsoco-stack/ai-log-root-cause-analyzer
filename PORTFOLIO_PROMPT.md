# ポートフォリオ掲載用プロンプト

以下の完成済みRepositoryと実アプリを確認し、既存ポートフォリオへ作品を追加してください。

## 掲載対象

- 作品名：AIログ解析・障害原因分析ツール
- カテゴリ：AIアプリ・AIツール
- サブカテゴリ：ログ解析・障害対応AI
- Repository：`ai-log-root-cause-analyzer`
- 公開URL：https://ai-log-root-cause-analyzer.vercel.app
- GitHub URL：https://github.com/shunsoco-stack/ai-log-root-cause-analyzer

## 必須確認

元の開発仕様だけで判断せず、次を実際に確認してください。

1. 実アプリの3種類のDemo
2. `README.md`
3. `package.json`
4. `src/lib/log-engine.ts`のParsing、Masking、Normalization、Grouping
5. `src/lib/analysis.ts`のStructured OutputとCitation Validation
6. `src/lib/ai-provider.ts`と`src/app/api/analyze/route.ts`のProvider構成
7. `public/icons/app-icon.svg`
8. lint / typecheck / test / buildの最新結果
9. 実アプリから取得したDesktop / Mobile Screenshot

## 作品説明で伝えること

この作品は「ログをAIへ貼って要約するツール」ではありません。大量の非構造ログを通常コードでParse・Sanitize・Normalize・Groupし、件数、頻度、Timelineを決定論的に作成した後、AIには原因候補の解釈だけを担当させます。

特に次を簡潔に示してください。

- Plain Text / JSON / Stack TraceのLog Parsing
- Original Logを破壊しないSecret / PII Masking
- Dynamic Value NormalizationとError Grouping
- Multi-source Timeline
- Structured AI Output
- Root Cause Candidates（断定しない）
- Evidence / CitationとOriginal LogのSource Jump
- Citation Allowlist Validation
- Human Review StatusとHuman Note
- Prompt Injection Defense
- Local-first Processing
- AI Failure時も残る決定論的な解析結果

## Primary CTA

- 「アプリを試す ↗」
- GitHub URLが存在する場合は「GitHubを見る」

URLは実在するものだけを設定し、未公開の場合は架空URLを作らないでください。

## Screenshot

実アプリから次を取得してください。AI生成した架空UI画像は禁止です。

1. Desktop：Database Timeout Demo解析後のLog Viewer + Root Cause Candidate + Evidence
2. Desktop：Error GroupsとIncident Timeline
3. Desktop：Secret Masking BannerとOriginal Log
4. Mobile：Analysis Tab

メインサムネイルは1を使用してください。Upload画面をメインにしないでください。

## 表記上の注意

- Concept Project / 自主制作であることを明示する
- OpenAI互換APIは環境変数設定時のみ利用可能と記載する
- AI未設定時の結果を「AI解析済み」と表現しない
- PDF Export、永続保存、手動Time Range Sliderなど未実装機能を掲載しない
- 使用技術は`package.json`と実装で確認できたものだけを書く
- 公開URL、GitHub URL、Screenshotは実物を確認してから追加する
