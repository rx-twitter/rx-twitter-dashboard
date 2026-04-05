import { describe, expect, it } from "vitest";

import { encodeBase32 } from "@/lib/encoding";

// ---------------------------------------------------------------------------
// T004: 20バイト入力の形式検証・一意性テスト・互換性テスト
// ---------------------------------------------------------------------------

describe("encodeBase32 — generateSessionId 用途の互換性テスト (T004)", () => {
  it("20バイト入力は長さ32の文字列を返す（oslo 互換）", () => {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const result = encodeBase32(bytes);
    expect(result).toHaveLength(32);
  });

  it("20バイト入力の出力は [A-Z2-7] のみで構成される", () => {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const result = encodeBase32(bytes);
    expect(result).toMatch(/^[A-Z2-7]+$/);
  });

  it("パディング文字 '=' を含まない", () => {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const result = encodeBase32(bytes);
    expect(result).not.toContain("=");
  });

  it("100回生成して全件が異なる（一意性保証）", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => {
        const bytes = new Uint8Array(20);
        crypto.getRandomValues(bytes);
        return encodeBase32(bytes);
      }),
    );
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// T005: RFC 4648 §10 公式テストベクター
// ---------------------------------------------------------------------------

describe("encodeBase32 — RFC 4648 §10 公式テストベクター (T005)", () => {
  const encoder = new TextEncoder();

  const vectors: [string, string][] = [
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ];

  for (const [input, expected] of vectors) {
    it(`"${input}" → "${expected}"`, () => {
      const bytes = encoder.encode(input);
      expect(encodeBase32(bytes)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// T006: エッジケーステスト
// ---------------------------------------------------------------------------

describe("encodeBase32 — エッジケース (T006)", () => {
  it("空バイト列は空文字列を返す", () => {
    expect(encodeBase32(new Uint8Array(0))).toBe("");
  });

  it("20バイト全ゼロは 'A' が32個", () => {
    const zeros = new Uint8Array(20).fill(0x00);
    expect(encodeBase32(zeros)).toBe("A".repeat(32));
  });

  it("20バイト全 0xFF は '7' が32個", () => {
    const ffs = new Uint8Array(20).fill(0xff);
    expect(encodeBase32(ffs)).toBe("7".repeat(32));
  });

  it.each([1, 2, 3, 4])("%i バイト入力でパディング '=' を含まない", (len) => {
    const bytes = new Uint8Array(len).fill(0xab);
    expect(encodeBase32(bytes)).not.toContain("=");
  });
});
