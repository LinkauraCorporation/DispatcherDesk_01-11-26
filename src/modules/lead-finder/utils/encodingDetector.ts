/**
 * Encoding detector for FMCSA Census CSV files.
 * Accurately detects whether a CSV uses UTF-8 or legacy Windows-1252 / ANSI encoding
 * to prevent replacement characters in names, addresses, and smart quotes.
 */

export type SupportedEncoding = 'auto' | 'utf-8' | 'windows-1252';

export async function detectCsvEncoding(file: File): Promise<'utf-8' | 'windows-1252'> {
  if (!file || file.size === 0) return 'utf-8';

  // Read a representative sample from the beginning of the file (64 KB)
  const sampleSize = Math.min(65536, file.size);
  const slice = file.slice(0, sampleSize);

  try {
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1. Check for standard UTF-8 Byte Order Mark (0xEF, 0xBB, 0xBF)
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'utf-8';
    }

    // 2. Trim up to 4 bytes from the end to avoid flagging a multi-byte sequence
    // that happened to be sliced right in the middle at the 64KB boundary.
    const safeLength = Math.max(0, bytes.length - 4);
    const testBytes = safeLength > 0 ? bytes.subarray(0, safeLength) : bytes;

    // 3. Test UTF-8 validity with fatal: true.
    // If testBytes contains isolated single-byte Windows-1252 high characters
    // (e.g. 0x92 for curly apostrophe, 0xE9 for é, 0xF1 for ñ), TextDecoder throws.
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    utf8Decoder.decode(testBytes);

    // If it did not throw, the sample is valid UTF-8 (or pure ASCII)
    return 'utf-8';
  } catch {
    // Decoding failed: File contains Windows-1252 / ANSI characters
    return 'windows-1252';
  }
}
