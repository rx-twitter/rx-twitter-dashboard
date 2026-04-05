# 実装計画: oslo/encoding を自前 Base32 実装に置き換え

**ブランチ**: `001-replace-oslo-encoding` | **日付**: 2026-04-05 | **仕様**: [spec.md](./spec.md)
**入力**: `/specs/001-replace-oslo-encoding/spec.md` からのフィーチャー仕様

## サマリー

アーカイブ済み `oslo` パッケージへの依存を除去するため、
`src/lib/auth.ts` 内でのみ使用されている `base32.encode()` を
RFC 4648 準拠の自前実装（`src/lib/encoding.ts`）で置き換える。

既存セッション ID（20バイト入力・パディングなし32文字 Base32）は
同一アルゴリズムを用いるため影響を受けない。
変更ファイルは3件（新規1件・修正2件）、外部依存は1件削除される。

## 技術コンテキスト

**言語/バージョン**: TypeScript 5.7、Node.js（@astrojs/node アダプター経由）\
**主要な依存関係**: astro v4、oslo（削除対象）、vitest、oxlint、oxfmt\
**ストレージ**: N/A（このフィーチャーに DB 変更なし）\
**テスト**: Vitest\
**ターゲットプラットフォーム**: Node.js サーバー（Linux コンテナ）\
**プロジェクトタイプ**: single（Web アプリ）\
**パフォーマンス目標**: N/A（Base32 エンコードはマイクロ秒オーダー、ボトルネックにならない）\
**制約**: 既存 Redis セッション ID を破損させてはならない。テストはすべて変更前と同一の結果でパスすること\
**スケール/スコープ**: 極小（変更ファイル3件、新規テスト1ファイル、依存削除1件）

## コンスティテューションチェック

_ゲート: フェーズ0の調査前にパスする必要あり。フェーズ1の設計後に再チェック。_

> 参照: `.specify/memory/constitution.md` v1.1.0

| 原則               | チェック内容                                                                                           | ステータス |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ---------- |
| I. クリーンコード  | `BASE32_ALPHABET` 定数で魔法の文字列を排除。`encodeBase32` は意図が自明な命名                          | ✅ PASS    |
| II. 早期リターン   | 空バイト列ガード節を先頭に配置。ループ内に `else` なし                                                 | ✅ PASS    |
| III. テスト容易性  | 純粋関数のため DI 不要・外部 API 依存なし。`encoding.test.ts` で完全にカバー可能                       | ✅ PASS    |
| IV. メソッドサイズ | `encodeBase32` は約10行。30行制限を大幅に下回る                                                        | ✅ PASS    |
| V. SRP             | エンコードロジックは `encoding.ts` に独立。`auth.ts` は import するのみ                                | ✅ PASS    |
| 技術スタック       | `any` 型不使用（`Uint8Array` + `string` のみ）。DB アクセスなし。oslo を使わないのがフィーチャーの目的 | ✅ PASS    |

**ゲート判定**: 全原則 PASS。フェーズ0・フェーズ1 に進む。

## プロジェクト構造

### ドキュメント（このフィーチャー）

```text
specs/001-replace-oslo-encoding/
├── plan.md              # このファイル
├── research.md          # フェーズ0の出力
├── quickstart.md        # フェーズ1の出力
├── checklists/
│   └── requirements.md  # 仕様品質チェックリスト（作成済み）
└── tasks.md             # /speckit.tasks コマンドで生成（未作成）
```

_注: エンティティ追加・API 新設なし → data-model.md・contracts/ は不要_

### ソースコード（リポジトリルート）

```text
src/
└── lib/
    ├── encoding.ts      # 新規作成: encodeBase32(bytes: Uint8Array): string
    └── auth.ts          # 修正: oslo import を encoding.ts に差し替え

tests/unit/lib/
    ├── encoding.test.ts # 新規作成: encodeBase32 のユニットテスト
    └── auth.test.ts     # 変更なし（既存テストが引き続きパスすることを確認）

package.json             # 修正: oslo を dependencies から削除
```

**構造の決定**: 単一プロジェクト構成（`src/lib/`）。変更はライブラリ層のみで、
UI・API ルート・DB 層への影響はゼロ。

## 複雑性の追跡

_コンスティテューション違反なし。記録事項なし。_
