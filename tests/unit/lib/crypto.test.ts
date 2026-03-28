import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "@/lib/crypto";

describe("crypto", () => {
  const testSecret = process.env.SESSION_SECRET!;

  describe("encryptToken / decryptToken", () => {
    it("暗号化→復号でもとのトークンが復元される", () => {
      const token = "test-access-token-12345";
      const encrypted = encryptToken(token, testSecret);
      const decrypted = decryptToken(encrypted, testSecret);

      expect(decrypted).toBe(token);
    });

    it("空文字を暗号化・復号できる", () => {
      const token = "";
      const encrypted = encryptToken(token, testSecret);
      const decrypted = decryptToken(encrypted, testSecret);

      expect(decrypted).toBe(token);
    });

    it("日本語を含むトークンを暗号化・復号できる", () => {
      const token = "テスト用トークン-abc123";
      const encrypted = encryptToken(token, testSecret);
      const decrypted = decryptToken(encrypted, testSecret);

      expect(decrypted).toBe(token);
    });

    it("長いトークンを暗号化・復号できる", () => {
      const token = "a".repeat(1000);
      const encrypted = encryptToken(token, testSecret);
      const decrypted = decryptToken(encrypted, testSecret);

      expect(decrypted).toBe(token);
    });

    it("同じトークンでも毎回異なる暗号文が生成される（IVのランダム性）", () => {
      const token = "same-token";
      const encrypted1 = encryptToken(token, testSecret);
      const encrypted2 = encryptToken(token, testSecret);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("暗号文を改ざんすると復号に失敗する", () => {
      const token = "original-token";
      const encrypted = encryptToken(token, testSecret);

      // base64 デコードして1バイト変更
      const buf = Buffer.from(encrypted, "base64");
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString("base64");

      expect(() => decryptToken(tampered, testSecret)).toThrow();
    });

    it("異なるシークレットでは復号できない", () => {
      const token = "secret-token";
      const encrypted = encryptToken(token, testSecret);

      // 別のシークレットで復号を試みる
      const differentSecret = "different-secret-that-is-32chars-long!!";
      expect(() => decryptToken(encrypted, differentSecret)).toThrow();
    });

    it("暗号文はbase64形式である", () => {
      const token = "test-token";
      const encrypted = encryptToken(token, testSecret);

      // base64 文字のみで構成されていること
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });
});
