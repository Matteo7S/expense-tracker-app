import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';

// Fallback version for Expo Go compatibility (no reanimated)
export function HelloWave() {
  return (
    <View>
      <ThemedText style={styles.text}>👋</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 28,
    lineHeight: 32,
    marginTop: -6,
  },
});
