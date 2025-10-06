import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  SafeAreaView,
  Platform,
  Animated,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, CameraPictureOptions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { receiptService } from '../../services/receiptService';
import { visionOCRService } from '../../services/visionOCRService';

type GenericLiveOCRScreenNavigationProp = StackNavigationProp<MainStackParamList, 'GenericLiveOCRCamera'>;

const { width, height } = Dimensions.get('window');

interface OCRAnalysis {
  text: string;
  confidence: number;
  accuracy: number;
  timestamp: number;
  status: 'analyzing' | 'success' | 'failed' | 'low_quality';
}

interface AnalysisProgress {
  progress: number; // 0-100
  stage: string;
}

// Soglia di precisione per considerare l'OCR valido
const ACCURACY_THRESHOLD = 90;

export function GenericLiveOCRScreen() {
  const navigation = useNavigation<GenericLiveOCRScreenNavigationProp>();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [liveOCREnabled, setLiveOCREnabled] = useState(true);
  const [detectedText, setDetectedText] = useState<DetectedText | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrInitialized, setOcrInitialized] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const ocrTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastOCRTime = useRef<number>(0);
  const isWeb = Platform.OS === 'web';

  // OCR processing interval in milliseconds
  const OCR_DEBOUNCE_DELAY = 2000; // 2 seconds between OCR calls
  const OCR_MIN_INTERVAL = 1500; // Minimum 1.5 seconds between calls

  useEffect(() => {
    StatusBar.setHidden(true);
    
    // Initialize Vision OCR
    initializeVisionOCR();
    
    return () => {
      StatusBar.setHidden(false);
      if (ocrTimeoutRef.current) {
        clearTimeout(ocrTimeoutRef.current);
      }
    };
  }, []);

  const initializeVisionOCR = async () => {
    try {
      console.log('🔍 Initializing Vision OCR...');
      const isAvailable = await visionOCRService.initialize();
      setOcrInitialized(isAvailable);
      
      if (!isAvailable) {
        console.log('⚠️ Vision OCR not available, live feedback disabled');
        setLiveOCREnabled(false);
      }
    } catch (error) {
      console.error('❌ Error initializing Vision OCR:', error);
      setOcrInitialized(false);
      setLiveOCREnabled(false);
    }
  };

  const processLiveOCR = useCallback(async () => {
    if (!liveOCREnabled || !ocrInitialized || isProcessingOCR || !cameraRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastOCRTime.current < OCR_MIN_INTERVAL) {
      return; // Too soon since last OCR call
    }

    try {
      setIsProcessingOCR(true);
      lastOCRTime.current = now;

      // Take a temporary photo for OCR processing
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3, // Lower quality for faster processing
        base64: false,
        exif: false,
      });

      if (photo?.uri) {
        console.log('📸 Processing live OCR...');
        const result = await visionOCRService.extractTextFromImage(photo.uri);
        
        // Clean up temporary file
        try {
          await FileSystem.deleteAsync(photo.uri);
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up temporary file:', cleanupError);
        }

        // Update detected text if we got meaningful results
        if (result.text.trim().length > 10 && result.confidence > 0.3) {
          setDetectedText({
            text: result.text.trim(),
            confidence: result.confidence,
            timestamp: now,
          });
          console.log(`✅ Live OCR detected text (${result.confidence.toFixed(2)} confidence):`, result.text.substring(0, 100));
        }
      }
    } catch (error) {
      console.error('❌ Live OCR error:', error);
    } finally {
      setIsProcessingOCR(false);
    }
  }, [liveOCREnabled, ocrInitialized, isProcessingOCR]);

  // Schedule live OCR processing with debouncing
  useEffect(() => {
    if (!liveOCREnabled || !ocrInitialized || isProcessingOCR) {
      return;
    }

    if (ocrTimeoutRef.current) {
      clearTimeout(ocrTimeoutRef.current);
    }

    ocrTimeoutRef.current = setTimeout(() => {
      processLiveOCR();
    }, OCR_DEBOUNCE_DELAY);

    return () => {
      if (ocrTimeoutRef.current) {
        clearTimeout(ocrTimeoutRef.current);
      }
    };
  }, [liveOCREnabled, ocrInitialized, isProcessingOCR, processLiveOCR]);

  const goBack = () => {
    navigation.goBack();
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('📁 File selected:', result.assets[0].uri);
        setCapturedImage(result.assets[0].uri);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Errore', 'Impossibile selezionare il file');
    }
  };

  // Web version uses file picker instead of camera
  if (isWeb) {
    return (
      <SafeAreaView style={styles.webContainer}>
        <View style={styles.webHeader}>
          <TouchableOpacity style={styles.webBackButton} onPress={goBack}>
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.webTitle}>Live OCR Generico</Text>
        </View>
        
        {!showPreview ? (
          <View style={styles.webUploadContainer}>
            <MaterialIcons name="receipt" size={80} color="#ccc" />
            <Text style={styles.webUploadTitle}>Seleziona Scontrino</Text>
            <Text style={styles.webUploadText}>
              Seleziona un'immagine dello scontrino dal tuo dispositivo
            </Text>
            
            <TouchableOpacity 
              style={styles.webUploadButton}
              onPress={pickImage}
            >
              <MaterialIcons name="file-upload" size={24} color="white" />
              <Text style={styles.webUploadButtonText}>Scegli File</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  if (!permission) {
    // Camera permissions are still loading
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.permissionText}>Caricamento...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <View style={styles.permissionContainer}>
        <MaterialIcons name="camera-alt" size={64} color="#ccc" />
        <Text style={styles.permissionTitle}>Accesso alla Fotocamera</Text>
        <Text style={styles.permissionText}>
          Questa app ha bisogno dell'accesso alla fotocamera per scansionare gli scontrini
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Concedi Accesso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      console.log('📸 Taking picture...');
      
      const options: CameraPictureOptions = {
        quality: 0.8,
        base64: false,
        exif: false,
      };

      const photo = await cameraRef.current.takePictureAsync(options);
      
      if (photo?.uri) {
        console.log('📸 Picture taken:', photo.uri);
        setCapturedImage(photo.uri);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Errore', 'Impossibile scattare la foto');
    }
  };

  const retakePicture = () => {
    console.log('🔄 Retaking picture...');
    setCapturedImage(null);
    setShowPreview(false);
  };

  const keepPicture = async () => {
    if (!capturedImage) return;

    setIsUploading(true);
    console.log('📤 Uploading generic receipt...', capturedImage);

    try {
      // Upload to a generic note spese
      const result = await receiptService.uploadGenericReceipt(capturedImage);
      
      if (result.success) {
        console.log('✅ Generic receipt uploaded successfully:', result.data);
        Alert.alert(
          'Successo',
          'Scontrino salvato nella nota spese generica!',
          [
            {
              text: 'OK',
              onPress: () => {
                // Reset for next photo
                setCapturedImage(null);
                setShowPreview(false);
              }
            }
          ]
        );
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('❌ Error uploading generic receipt:', error);
      Alert.alert(
        'Errore',
        'Impossibile salvare lo scontrino. Riprova.',
        [
          {
            text: 'OK',
            onPress: () => {
              setCapturedImage(null);
              setShowPreview(false);
            }
          }
        ]
      );
    } finally {
      setIsUploading(false);
    }
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleLiveOCR = () => {
    setLiveOCREnabled(prev => {
      const newValue = !prev;
      if (newValue && !ocrInitialized) {
        Alert.alert(
          'Vision OCR non disponibile',
          'Il riconoscimento testo live non è disponibile su questo dispositivo.'
        );
        return false;
      }
      return newValue;
    });
  };

  if (showPreview && capturedImage) {
    return (
      <SafeAreaView style={styles.previewContainer}>
        <StatusBar hidden />
        
        {/* Preview Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.previewImage}
            contentFit="contain"
          />
        </View>

        {/* Preview Controls */}
        <View style={styles.previewControls}>
          <Text style={styles.previewTitle}>Anteprima Scontrino</Text>
          <Text style={styles.previewSubtitle}>
            Vuoi salvare questo scontrino?
          </Text>
          
          {isUploading ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.uploadingText}>Salvando...</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.discardButton]}
                onPress={retakePicture}
              >
                <MaterialIcons name="close" size={24} color="#ff4444" />
                <Text style={styles.discardButtonText}>Scarta</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.keepButton]}
                onPress={keepPicture}
              >
                <MaterialIcons name="check" size={24} color="white" />
                <Text style={styles.keepButtonText}>Salva</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Camera View */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        ratio="16:9"
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <MaterialIcons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
          
          <Text style={styles.titleText}>Live OCR Generico</Text>
          
          <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
            <MaterialIcons name="flip-camera-ios" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Live OCR Toggle */}
        <View style={styles.liveOCRControls}>
          <View style={styles.ocrToggle}>
            <MaterialIcons name="text-fields" size={20} color="white" />
            <Text style={styles.ocrToggleText}>Live OCR</Text>
            <Switch
              value={liveOCREnabled}
              onValueChange={toggleLiveOCR}
              trackColor={{ false: '#767577', true: '#007AFF' }}
              thumbColor={liveOCREnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Camera Overlay */}
        <View style={styles.overlay}>
          {/* Scanning Frame */}
          <View style={styles.scanningFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          
          <Text style={styles.instructionText}>
            Inquadra lo scontrino all'interno del riquadro
          </Text>
        </View>

        {/* Live OCR Text Overlay */}
        {liveOCREnabled && detectedText && (
          <View style={styles.liveTextOverlay}>
            <View style={styles.liveTextHeader}>
              <MaterialIcons name="visibility" size={16} color="#007AFF" />
              <Text style={styles.liveTextTitle}>Testo rilevato</Text>
              {isProcessingOCR && (
                <ActivityIndicator size="small" color="#007AFF" />
              )}
            </View>
            <ScrollView style={styles.liveTextContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.liveTextValue}>
                {detectedText.text}
              </Text>
            </ScrollView>
            <View style={styles.liveTextFooter}>
              <Text style={styles.confidenceText}>
                Confidenza: {(detectedText.confidence * 100).toFixed(0)}%
              </Text>
            </View>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
        
        {/* Gallery Button - positioned in bottom left like WhatsApp */}
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
          <MaterialIcons name="photo-library" size={30} color="white" />
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveOCRControls: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  ocrToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ocrToggleText: {
    color: 'white',
    fontSize: 16,
    marginLeft: 8,
    marginRight: 12,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  scanningFrame: {
    width: width - 80,
    height: (width - 80) * 1.4,
    position: 'relative',
    marginBottom: 30,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  liveTextOverlay: {
    position: 'absolute',
    bottom: 150,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  liveTextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  liveTextTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 6,
    flex: 1,
  },
  liveTextContent: {
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveTextValue: {
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
  },
  liveTextFooter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  confidenceText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'right',
  },
  bottomControls: {
    paddingBottom: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  previewImage: {
    width: width,
    height: height * 0.7,
  },
  previewControls: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  previewSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  uploadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  uploadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 25,
    marginHorizontal: 10,
  },
  discardButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#ff4444',
  },
  discardButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  keepButton: {
    backgroundColor: '#007AFF',
  },
  keepButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Web-specific styles
  webContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  webBackButton: {
    padding: 8,
    marginRight: 16,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  webUploadContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  webUploadTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  webUploadText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  webUploadButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  webUploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Gallery Button styles - positioned like WhatsApp
  galleryButton: {
    position: 'absolute',
    bottom: 70, // Same level as capture button
    left: 20,   // Bottom left corner
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
});
