import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string) => `welfy:ocr:qwen:v1:${userId}`;

export async function getQwenEnabled(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    // No migration from the former automatic Azure flow: cloud analysis requires opt-in.
    return await AsyncStorage.getItem(keyFor(userId)) === 'true';
  } catch {
    return false;
  }
}

export async function setQwenEnabled(userId: string, enabled: boolean): Promise<void> {
  if (!userId) throw new Error('Account required');
  await AsyncStorage.setItem(keyFor(userId), enabled ? 'true' : 'false');
}
