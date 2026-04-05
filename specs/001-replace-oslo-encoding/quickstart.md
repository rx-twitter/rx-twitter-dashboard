# クイックスタート: encoding.ts の使い方

**フェーズ1 出力** | **日付**: 2026-04-05

---

## 概要

`src/lib/encoding.ts` は RFC 4648 準拠の Base32 エンコード関数を提供する
ゼロ依存のユーティリティモジュールです。

---

## API

### `encodeBase32(bytes: Uint8Array): string`

`Uint8Array` を受け取り、RFC 4648 Base32（A-Z, 2-7、パディングなし）の文字列を返す純粋関数。

| 引数    | 型           | 説明                             |
| ------- | ------------ | -------------------------------- |
| `bytes` | `Uint8Array` | エンコードするバイト列（任意長） |

| 戻り値 | 型       | 説明                                                      |
| ------ | -------- | --------------------------------------------------------- |
|        | `string` | Base32 エンコードされた文字列。空バイト列の場合は空文字列 |

---

## 使用例

### セッション ID 生成（既存の使い方）

`src/lib/auth.ts` での使い方（置き換え後）:

```typescript
import { encodeBase32 } from "./encoding";

export function generateSessionId(): string {
  const bytes = new Uint8Array(20); // 160 bits
  crypto.getRandomValues(bytes);
  return encodeBase32(bytes); // 32文字の Base32 文字列
}
```

### 直接使用

```typescript
import { encodeBase32 } from "@/lib/encoding";

const bytes = new Uint8Array([0x66, 0x6f, 0x6f]); // "foo"
const encoded = encodeBase32(bytes);
// → "MZXW6"
```

---

## データモデル / コントラクト

このフィーチャーは純粋なライブラリ置き換えであり、以下は変更されません:

- **API エンドポイント**: 変更なし
- **DB スキーマ**: 変更なし
- **Redis キー構造**: 変更なし（`lucia:session:{sessionId}` のまま）
- **セッション ID 形式**: 変更なし（32文字 Base32、`[A-Z2-7]` のみ）
- **Cookie 属性**: 変更なし

---

## 移行

既存ユーザーへの影響: **ゼロ**。

- 既存の Redis セッション ID は TTL（7日間）で自然失効する
- 新しいセッション ID は自前 Base32 実装で生成されるが、フォーマットは同一
- 再ログイン不要

---

## 削除される外部依存

```diff
- "oslo": "^1.2.1"
```

`package.json` の `dependencies` から削除し、`npm install` で `node_modules` からも除去する。
