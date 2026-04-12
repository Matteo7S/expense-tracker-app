import * as FileSystem from 'expo-file-system/legacy';

/**
 * Extracts the relative filename from a receipt image path.
 * Strips the documentDirectory prefix so the DB stores only the relative part
 * (e.g. "receipt_123.jpg" or "receipts/receipt_123.jpg").
 */
export function toRelativeReceiptPath(absoluteOrRelative: string): string {
  if (!absoluteOrRelative) return absoluteOrRelative;

  const docDir = FileSystem.documentDirectory;
  if (docDir && absoluteOrRelative.startsWith(docDir)) {
    return absoluteOrRelative.slice(docDir.length);
  }
  // Already relative or a remote URL — return as-is
  return absoluteOrRelative;
}

/**
 * Resolves a relative receipt filename to a full file:// path using the
 * current documentDirectory. Handles both relative and already-absolute paths.
 */
export function resolveReceiptPath(pathOrFilename: string | null | undefined): string | null {
  if (!pathOrFilename) return null;

  // Remote URL — return as-is
  if (pathOrFilename.startsWith('http://') || pathOrFilename.startsWith('https://')) {
    return pathOrFilename;
  }

  // Already an absolute file path — check if it uses the current container
  if (pathOrFilename.startsWith('file://')) {
    const docDir = FileSystem.documentDirectory;
    if (docDir && pathOrFilename.startsWith(docDir)) {
      return pathOrFilename; // current container, all good
    }
    // Old container UUID — extract relative part and rebuild
    const parts = pathOrFilename.split('/Documents/');
    if (parts.length === 2) {
      return `${FileSystem.documentDirectory}${parts[1]}`;
    }
    return pathOrFilename; // can't fix, return as-is
  }

  // Relative path — prepend current documentDirectory
  return `${FileSystem.documentDirectory}${pathOrFilename}`;
}
