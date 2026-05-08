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
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, CameraPictureOptions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { databaseManager } from '../../services/database';
import { syncManager } from '../../services/syncManager';
import { triggerExpenseRefresh } from '../../hooks/useExpenseRefresh';
import { toRelativeReceiptPath } from '../../utils/receiptPath';
import { useI18n } from '../../i18n';

type CameraScreenNavigationProp = StackNavigationProp<MainStackParamList, 'Camera' | 'GenericCamera'>;
type CameraScreenRouteProp = RouteProp<MainStackParamList, 'Camera' | 'GenericCamera'>;

const { width, height } = Dimensions.get('window');

export function CameraScreen() {
  const navigation = useNavigation<CameraScreenNavigationProp>();
  const route = useRoute<CameraScreenRouteProp>();
  const { t } = useI18n();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    StatusBar.setHidden(true);
    
    return () => {
      StatusBar.setHidden(false);
    };
  }, []);

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
      Alert.alert(t('common.error'), t('scanner.pickFileError'));
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
          <Text style={styles.webTitle}>{t('scanner.uploadReceipt')}</Text>
        </View>
        
        {!showPreview ? (
          <View style={styles.webUploadContainer}>
            <MaterialIcons name="receipt" size={80} color="#ccc" />
            <Text style={styles.webUploadTitle}>{t('scanner.selectReceipt')}</Text>
            <Text style={styles.webUploadText}>
              {t('scanner.selectReceiptDescription')}
            </Text>
            
            <TouchableOpacity 
              style={styles.webUploadButton}
              onPress={pickImage}
            >
              <MaterialIcons name="file-upload" size={24} color="white" />
              <Text style={styles.webUploadButtonText}>{t('scanner.chooseFile')}</Text>
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
        <Text style={styles.permissionText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <View style={styles.permissionContainer}>
        <MaterialIcons name="camera-alt" size={64} color="#ccc" />
        <Text style={styles.permissionTitle}>{t('scanner.cameraAccess')}</Text>
        <Text style={styles.permissionText}>
          {t('scanner.cameraAccessDescription')}
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>{t('scanner.grantAccess')}</Text>
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
      Alert.alert(t('common.error'), t('scanner.takePictureError'));
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
    console.log('💾 Saving receipt locally...', capturedImage);

    try {
      // Salva l'immagine permanentemente nel file system locale
      const fileName = `receipt_${Date.now()}.jpg`;
      const permanentPath = `${FileSystem.documentDirectory}receipts/${fileName}`;
      
      // Crea la directory se non esiste usando l'API legacy
      const receiptDir = `${FileSystem.documentDirectory}receipts/`;
      const dirInfo = await FileSystem.getInfoAsync(receiptDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(receiptDir, { intermediates: true });
      }
      
      // Copia l'immagine nella posizione permanente usando l'API legacy
      await FileSystem.copyAsync({
        from: capturedImage,
        to: permanentPath,
      });
      
      console.log('📁 Image saved to:', permanentPath);
      
      const targetReportId = await databaseManager.getDefaultReportId();
      
      // Crea la spesa nel database locale con dati minimi
      const expenseId = await databaseManager.createExpense({
        expense_report_id: targetReportId,
        amount: 0, // Importo da completare successivamente
        currency: 'EUR',
        merchant_name: '', // Da completare successivamente
        category: 'other',
        receipt_date: new Date().toISOString().split('T')[0],
        receipt_time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        receipt_image_path: toRelativeReceiptPath(permanentPath),
        extracted_data: JSON.stringify({ source: 'camera_simple' }),
        notes: 'Caricato da fotocamera semplice - da completare',
        is_archived: false,
        sync_status: 'pending' // Sarà sincronizzato in background
      });
      
      console.log('✅ Expense saved locally:', expenseId);
      
      // Trigger la sincronizzazione in background
      console.log('🔄 Triggering background sync...');
      syncManager.syncAll().catch(error => {
        console.error('⚠️ Background sync failed:', error);
        // Non mostrare errore all'utente - la sincronizzazione riproverà automaticamente
      });
      
      // Trigger refresh in all listening screens
      triggerExpenseRefresh();
      
      // Mostra messaggio di successo
      Alert.alert(
        t('scanner.receiptSavedTitle'),
        t('scanner.receiptSavedMessage'),
        [
          {
            text: t('scanner.continueScanning'),
            style: 'default',
            onPress: () => {
              // Reset per la prossima foto
              setCapturedImage(null);
              setShowPreview(false);
            }
          },
          {
            text: t('scanner.goToExpenses'),
            style: 'cancel',
            onPress: () => {
              // Reset e torna alla lista
              setCapturedImage(null);
              setShowPreview(false);
              navigation.navigate('ExpenseReportsTabs');
            }
          }
        ]
      );
      
    } catch (error) {
      console.error('❌ Error saving receipt locally:', error);
      Alert.alert(
        t('common.error'),
        t('scanner.saveReceiptError'),
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
          <Text style={styles.previewTitle}>{t('scanner.previewTitle')}</Text>
          <Text style={styles.previewSubtitle}>
            {t('scanner.previewQuestion')}
          </Text>
          
          {isUploading ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.uploadingText}>{t('common.loading')}</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.discardButton]}
                onPress={retakePicture}
              >
                <MaterialIcons name="close" size={24} color="#ff4444" />
                <Text style={styles.discardButtonText}>{t('scanner.discard')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.keepButton]}
                onPress={keepPicture}
              >
                <MaterialIcons name="check" size={24} color="white" />
                <Text style={styles.keepButtonText}>{t('scanner.keep')}</Text>
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
          
          <Text style={styles.titleText}>{t('scanner.scanReceipt')}</Text>
          
          <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
            <MaterialIcons name="flip-camera-ios" size={28} color="white" />
          </TouchableOpacity>
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
            {t('scanner.frameInstruction')}
          </Text>
        </View>

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
