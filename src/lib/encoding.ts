const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 Base32 エンコード（パディングなし）
 *
 * @param bytes エンコードするバイト列
 * @returns Base32 エンコードされた文字列（A-Z, 2-7 のみ）
 */
export function encodeBase32(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}
