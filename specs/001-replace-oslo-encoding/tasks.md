---
description: "oslo/encoding を自前 Base32 実装に置き換えるタスクリスト"
---

# タスク: oslo/encoding を自前 Base32 実装に置き換え

**入力**: `specs/001-replace-oslo-encoding/` からの設計ドキュメント\
**前提条件**: plan.md ✅、spec.md ✅、research.md ✅、quickstart.md ✅\
**テスト**: spec.md で明示的に FR-005・FR-006 として要求済み → テストタスクを含む\
**整理**: US1（oslo 除去・実装）→ US2（テストカバレッジ）→ ポリッシュ

## 形式: `[ID] [P?] [Story] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[Story]**: このタスクが属するユーザーストーリー
- 説明に正確なファイルパスを含めること

---

## フェーズ1: US1 — 既存セッション互換を保った oslo 依存の除去（P1）

**ストーリーの目標**: `oslo` パッケージを完全除去し、RFC 4648 準拠の自前 Base32 実装に置き換える。既存 Redis セッション ID への影響ゼロを保証する。

**独立テスト基準**: T004 完了後に `npm run test` がグリーンであれば、このストーリーは単独でリリース可能。

- [x] T001 [US1] `src/lib/encoding.ts` を新規作成し、`BASE32_ALPHABET`（`"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"`）定数と `encodeBase32(bytes: Uint8Array): string` 純粋関数を実装する
- [x] T002 [P] [US1] `package.json` の `dependencies` から `"oslo"` を削除し、`npm install` を実行して `node_modules` からも除去する（`package-lock.json` を更新）
- [x] T003 [P] [US1] `src/lib/auth.ts` の `import { base32 } from "oslo/encoding"` を `import { encodeBase32 } from "./encoding"` に差し替え、`base32.encode(bytes)` を `encodeBase32(bytes)` に変更する
- [x] T004 [P] [US1] `tests/unit/lib/encoding.test.ts` を新規作成し、20バイト入力の形式検証（長さ32・`[A-Z2-7]` のみ）・一意性テスト（100回生成で全件異なる）・oslo 互換性コメントを含む互換性テストを作成する

> **依存関係**: T001 完了後に T003・T004 を並列実行可能。T002 は T001 と並列実行可能。

---

## フェーズ2: US2 — Base32 エンコードのテストカバレッジ確保（P2）

**ストーリーの目標**: RFC 4648 §10 公式テストベクターとエッジケースを `encoding.test.ts` に追加し、自前実装の正確性を継続的に保証する。

**独立テスト基準**: T005・T006 完了後に `npm run test` がグリーンであれば、このストーリーは単独で完了。

- [x] T005 [P] [US2] `tests/unit/lib/encoding.test.ts` に RFC 4648 §10 公式7テストベクターを追加する（`""→""`・`"f"→"MY"`・`"fo"→"MZXQ"`・`"foo"→"MZXW6"`・`"foob"→"MZXW6YQ"`・`"fooba"→"MZXW6YTB"`・`"foobar"→"MZXW6YTBOI"` を TextEncoder で Uint8Array に変換して検証）
- [x] T006 [P] [US2] `tests/unit/lib/encoding.test.ts` にエッジケーステスト4件を追加する：空入力→空文字列、20バイト全ゼロ→32個の `"A"`、20バイト全 `0xFF`→32個の `"7"`、5の倍数でないバイト長（1・2・3・4バイト）でパディング `=` が含まれないこと

> **依存関係**: T004 完了後に T005・T006 を並列実行可能。

---

## フェーズ3: ポリッシュと品質ゲート

**目的**: コンスティテューション全原則への準拠を確認し、PR マージ条件を満たす。

- [x] CQ01 [P] クリーンコード確認: `BASE32_ALPHABET` 定数化・`encodeBase32` 命名・DRY を `src/lib/encoding.ts` で目視レビュー（原則 I）
- [x] CQ02 [P] 早期リターン確認: `encodeBase32` の空バイト列ガード節が先頭にあるか・`else` ブロックが残存していないか確認（原則 II）
- [x] CQ03 [P] テスト容易性確認: `encodeBase32` が純粋関数であり外部依存なしでテスト可能であることを確認（原則 III）
- [x] CQ04 [P] メソッドサイズ確認: `encodeBase32` が30行以内であることを確認（原則 IV）
- [x] CQ05 [P] SRP 確認: `encoding.ts` がエンコードのみ・`auth.ts` がセッション管理のみの責務であることを確認（原則 V）
- [x] CQ06 `npm run lint && npm run format:check && npm run build` をすべてグリーンにする
- [x] CQ07 `npm run test` ですべてのテスト（既存テスト含む）がグリーンであることを確認

---

## 依存関係グラフ

```
T002 ──────────────────────────────────────────┐
T001 ──┬── T003 ──────────────────────────────┼── CQ01〜CQ07
       └── T004 ──┬── T005 ──────────────────┘
                  └── T006 ──────────────────┘
```

## 並列実行例

```
# ステップ1（並列）
T001 + T002

# ステップ2（T001 完了後、並列）
T003 + T004

# ステップ3（T004 完了後、並列）
T005 + T006

# ステップ4（全タスク完了後、並列可能なものは並列）
CQ01 + CQ02 + CQ03 + CQ04 + CQ05
CQ06
CQ07
```

## 実装戦略

**MVP スコープ**: フェーズ1（T001〜T004）のみで SC-001・SC-002・SC-004 を達成可能。
フェーズ2（T005・T006）は自前実装の長期品質保証として追加するが、
本番リリースロールバックが必要になるリスクは両フェーズとも同等にゼロ。

**推奨実装順序**:

1. T001 で `encodeBase32` を実装、T002 で oslo を削除（並列可）
2. T003 で `auth.ts` を差し替え、T004 で互換性テストを作成（並列可）
3. `npm run test` でグリーンを確認（US1 完了）
4. T005・T006 で RFC 4648 フルカバレッジを追加
5. CQ01〜CQ07 で品質ゲートを通過
