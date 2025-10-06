import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { visionOCRService } from '../../services/visionOCRService';

export function TestVisionOCR() {
  const [initialized, setInitialized] = useState(false);
  const [capabilities, setCapabilities] = useState<any>(null);

  useEffect(() => {
    testVisionOCR();
  }, []);

  const testVisionOCR = async () => {
    try {
      console.log('🧪 Testing Vision OCR initialization...');
      const isAvailable = await visionOCRService.initialize();
      console.log(`🧪 Vision OCR available: ${isAvailable}`);
      
      setInitialized(isAvailable);
      
      const caps = visionOCRService.getCapabilities();
      console.log('🧪 Vision OCR capabilities:', caps);
      setCapabilities(caps);
      
    } catch (error) {
      console.error('🧪 Error testing Vision OCR:', error);
      Alert.alert('Test Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const testMockOCR = async () => {
    try {
      console.log('🧪 Testing mock OCR...');
      const result = await visionOCRService.extractTextFromImage('test://mock-image');
      console.log('🧪 Mock OCR result:', result);
      
      Alert.alert(
        'Mock OCR Test Result',
        `Text: ${result.text.substring(0, 100)}...\nConfidence: ${(result.confidence * 100).toFixed(1)}%\nMethod: ${result.method}`
      );
    } catch (error) {
      console.error('🧪 Error in mock OCR test:', error);
      Alert.alert('Mock OCR Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vision OCR Test</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.label}>Initialized:</Text>
        <Text style={styles.value}>{initialized ? '✅ Yes' : '❌ No'}</Text>
      </View>
      
      {capabilities && (
        <View style={styles.capabilitiesContainer}>
          <Text style={styles.label}>Capabilities:</Text>
          <Text style={styles.capabilityText}>
            Platform: {capabilities.platform}{'\n'}
            Vision Available: {capabilities.visionAvailable ? '✅' : '❌'}{'\n'}
            Multi Language: {capabilities.features.multiLanguage ? '✅' : '❌'}{'\n'}
            Bounding Boxes: {capabilities.features.boundingBoxes ? '✅' : '❌'}{'\n'}
            High Accuracy: {capabilities.features.highAccuracy ? '✅' : '❌'}
          </Text>
        </View>
      )}
      
      <TouchableOpacity style={styles.button} onPress={testMockOCR}>
        <Text style={styles.buttonText}>Test Mock OCR</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testVisionOCR}>
        <Text style={styles.buttonText}>Re-test Vision OCR</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 10,
  },
  value: {
    fontSize: 16,
  },
  capabilitiesContainer: {
    marginVertical: 20,
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  capabilityText: {
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
