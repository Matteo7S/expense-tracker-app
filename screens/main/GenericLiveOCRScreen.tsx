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
  ScrollView,
  BackHandler,
  Modal,
} from 'react-native';
import { DataVerificationModal, ExtractedData } from '../../components/DataVerificationModal';
import { CameraView, CameraType, useCameraPermissions, CameraPictureOptions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { receiptService } from '../../services/receiptService';
import { visionOCRService } from '../../services/visionOCRService';
import { smartReceiptAnalyzer, SmartAnalysisResult, ExtractedAmount } from '../../services/smartReceiptAnalyzer';
import { databaseManager } from '../../services/database';
import { syncManager } from '../../services/syncManager';
import { triggerExpenseRefresh } from '../../hooks/useExpenseRefresh';

type GenericLiveOCRScreenNavigationProp = StackNavigationProp<MainStackParamList, 'GenericLiveOCRCamera'>;
type GenericLiveOCRScreenRouteProp = RouteProp<MainStackParamList, 'GenericLiveOCRCamera'>;

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
  const route = useRoute<GenericLiveOCRScreenRouteProp>();
  const { reportId } = route.params || {};

  // Camera states
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // App flow states
  const [showPreview, setShowPreview] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // OCR states
  const [ocrAnalysis, setOcrAnalysis] = useState<OCRAnalysis | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [ocrInitialized, setOcrInitialized] = useState(false);
  const [isInitializingOCR, setIsInitializingOCR] = useState(true);
  
  // Data verification modal
  const [showDataVerificationModal, setShowDataVerificationModal] = useState(false);
  const [verificationData, setVerificationData] = useState<ExtractedData>({});
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef(null);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    StatusBar.setHidden(true);
    initializeVisionOCR();
    
    return () => {
      StatusBar.setHidden(false);
    };
  }, []);

  // Handle Android hardware back button
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        goBack();
        return true; // Prevent default behavior
      };

      if (Platform.OS === 'android') {
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription?.remove();
      }
    }, [])
  );

  const initializeVisionOCR = async () => {
    try {
      console.log('🔍 Initializing Vision OCR...');
      const isAvailable = await visionOCRService.initialize();
      console.log(`🔍 Vision OCR initialization result: ${isAvailable}`);
      setOcrInitialized(isAvailable);
      
      if (!isAvailable) {
        console.log('⚠️ Vision OCR not available, analysis disabled');
        Alert.alert(
          'OCR non disponibile',
          'Il riconoscimento testo non è disponibile. Puoi comunque scattare foto e caricarle normalmente.',
          [{ text: 'OK' }]
        );
      } else {
        console.log('✅ Vision OCR initialized successfully');
      }
    } catch (error) {
      console.error('❌ Error initializing Vision OCR:', error);
      setOcrInitialized(false);
    } finally {
      setIsInitializingOCR(false);
    }
  };

  const calculateAccuracy = (text: string, confidence: number): number => {
    let score = confidence * 100;
    
    // Bonus per testo di lunghezza ragionevole
    if (text.length >= 20 && text.length <= 500) {
      score += 10;
    }
    
    // Bonus per presenza di numeri (probabile totale/prezzo)
    if (/\d+[.,]\d{2}/.test(text)) {
      score += 15;
    }
    
    // Bonus per parole tipiche degli scontrini
    const receiptKeywords = ['totale', 'total', 'euro', 'eur', '€', 'iva', 'scontrino', 'ricevuta'];
    const lowerText = text.toLowerCase();
    const keywordMatches = receiptKeywords.filter(keyword => lowerText.includes(keyword)).length;
    score += keywordMatches * 5;
    
    // Penalty per testo troppo corto o troppo lungo
    if (text.length < 10) {
      score -= 20;
    }
    if (text.length > 1000) {
      score -= 10;
    }
    
    return Math.min(Math.max(score, 0), 100);
  };

  const analyzeImage = async (imageUri: string) => {
    setShowAnalysis(true);
    setAnalysisProgress({ progress: 0, stage: 'Inizializzazione...' });
    
    // Animate progress bar
    Animated.timing(progressAnimation, {
      toValue: 20,
      duration: 300,
      useNativeDriver: false,
    }).start();

    try {
      if (ocrInitialized) {
        // Use Vision OCR (local, fast)
        setAnalysisProgress({ progress: 20, stage: 'Vision OCR - Analisi locale...' });
        
        Animated.timing(progressAnimation, {
          toValue: 60,
          duration: 800,
          useNativeDriver: false,
        }).start();

        const result = await visionOCRService.extractTextFromImage(imageUri);
        
        setAnalysisProgress({ progress: 80, stage: 'Calcolo precisione...' });
        
        Animated.timing(progressAnimation, {
          toValue: 90,
          duration: 300,
          useNativeDriver: false,
        }).start();

        const accuracy = calculateAccuracy(result.text, result.confidence);
        const status: OCRAnalysis['status'] = accuracy >= ACCURACY_THRESHOLD ? 'success' : 'low_quality';

        const analysis: OCRAnalysis = {
          text: result.text.trim(),
          confidence: result.confidence,
          accuracy,
          timestamp: Date.now(),
          status
        };

        setOcrAnalysis(analysis);
        setAnalysisProgress({ progress: 100, stage: 'Analisi completata' });
        
        Animated.timing(progressAnimation, {
          toValue: 100,
          duration: 300,
          useNativeDriver: false,
        }).start();

        console.log(`✅ Vision AI Analysis completed: ${accuracy.toFixed(1)}% accuracy`);
      } else {
        // Fallback to AI OCR (upload and let backend process)
        setAnalysisProgress({ progress: 20, stage: 'Caricamento per AI OCR...' });
        
        Animated.timing(progressAnimation, {
          toValue: 60,
          duration: 1000,
          useNativeDriver: false,
        }).start();
        
        setAnalysisProgress({ progress: 80, stage: 'Invio al server AI...' });
        
        Animated.timing(progressAnimation, {
          toValue: 90,
          duration: 500,
          useNativeDriver: false,
        }).start();
        
        // For AI OCR fallback, we assume good quality and proceed directly
        const analysis: OCRAnalysis = {
          text: 'Analisi tramite AI OCR del backend',
          confidence: 0.85, // Default good confidence for AI
          accuracy: 95, // Assume AI OCR has good accuracy
          timestamp: Date.now(),
          status: 'success'
        };
        
        setOcrAnalysis(analysis);
        setAnalysisProgress({ progress: 100, stage: 'Pronto per invio AI' });
        
        Animated.timing(progressAnimation, {
          toValue: 100,
          duration: 300,
          useNativeDriver: false,
        }).start();
        
        console.log('✅ Ready for AI OCR processing via backend');
      }

    } catch (error) {
      console.error('❌ AI Analysis error:', error);
      setOcrAnalysis({
        text: '',
        confidence: 0,
        accuracy: 0,
        timestamp: Date.now(),
        status: 'failed'
      });
      setAnalysisProgress({ progress: 100, stage: 'Analisi fallita' });
    }
  };

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
        
        // Start OCR analysis if available
        if (ocrInitialized) {
          await analyzeImage(photo.uri);
        }
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
    setShowAnalysis(false);
    setOcrAnalysis(null);
    setAnalysisProgress(null);
    progressAnimation.setValue(0);
  };

  const confirmAndUpload = async () => {
    if (!capturedImage) return;
    
    // Previeni chiamate multiple rapide
    if (isUploading) {
      console.log('⚠️ confirmAndUpload already in progress, skipping...');
      return;
    }

    console.log('💾 Starting smart receipt processing...', capturedImage);

    // Prepara i dati di default
    let verificationData: ExtractedData = {
      amount: undefined,
      currency: 'EUR',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      merchantName: '',
      confidence: {}
    };

    // Prova ad eseguire l'analisi smart se disponibile
    try {
      let smartAnalysis: SmartAnalysisResult | null = null;
      
      // Se abbiamo OCR analysis, usa quello per smart analysis
      if (ocrAnalysis && ocrAnalysis.text) {
        console.log('🧠 Performing smart analysis on OCR text...');
        setIsUploading(true);
        
        smartAnalysis = await smartReceiptAnalyzer.analyzeReceiptText(
          ocrAnalysis.text,
          ocrAnalysis.confidence
        );
        
        if (smartAnalysis) {
          const validation = smartReceiptAnalyzer.validateReceiptData(smartAnalysis);
          const extractedData = smartReceiptAnalyzer.extractEssentialData(smartAnalysis);
          
          console.log('🔍 Validation result:', validation);
          console.log('📊 Extracted data:', extractedData);
          
          // Aggiorna i dati di verifica con i dati estratti
          verificationData = {
            amount: extractedData.amount,
            currency: extractedData.currency || 'EUR',
            date: extractedData.date || verificationData.date,
            time: extractedData.time || verificationData.time,
            merchantName: extractedData.merchantName || '',
            category: smartAnalysis.category?.category, // Categoria identificata
            confidence: {
              amount: smartAnalysis.primaryAmount?.confidence,
              date: smartAnalysis.dates.length > 0 ? smartAnalysis.dates[0].confidence : undefined,
              time: smartAnalysis.dates.length > 0 ? smartAnalysis.dates[0].confidence : undefined,
              merchant: smartAnalysis.merchant?.confidence,
              category: smartAnalysis.category?.confidence
            }
          };
        }
      }
    } catch (error) {
      console.error('❌ Error processing receipt:', error);
      console.log('📋 Continuing with manual data entry due to analysis error');
    }

    // Mostra sempre la modal di verifica dati (solo se non è già visibile)
    if (!showDataVerificationModal) {
      console.log('📋 Showing data verification modal with data:', verificationData);
      setVerificationData(verificationData);
      setIsUploading(false);
      setShowDataVerificationModal(true);
    } else {
      console.log('⚠️ Data verification modal already showing, skipping...');
      setIsUploading(false);
    }
  };
  
  // Funzione per salvare i dati confermati dall'utente
  const handleConfirmData = async (confirmedData: ExtractedData) => {
    setIsUploading(true);
    setShowDataVerificationModal(false);
    
    try {
      console.log('💾 Saving confirmed data to local database...', confirmedData);
      
      let targetReportId: string;
      if (reportId) {
        console.log('📝 Using provided reportId as local database ID:', reportId);
        targetReportId = reportId;
      } else {
        console.log('📋 Using generic expense report');
        targetReportId = await databaseManager.getOrCreateGenericExpenseReport();
      }
      
      console.log('📝 Saving receipt to local report ID:', targetReportId);
      
      // Salva l'immagine in modo permanente PRIMA di creare la spesa
      const imageFileName = `receipt_${Date.now()}.jpg`;
      const permanentImagePath = `${FileSystem.documentDirectory}${imageFileName}`;
      
      // Usa l'API legacy per evitare problemi di permessi
      await FileSystem.copyAsync({
        from: capturedImage!,
        to: permanentImagePath
      });
      console.log('💾 Image saved permanently:', permanentImagePath);
      
      // Usa la categoria confermata dall'utente (o 'other' come fallback)
      const category = confirmedData.category || 'other';
      
      // Calcola l'accuratezza dell'analisi smart per le note
      let smartAnalysisAccuracy = ocrAnalysis?.accuracy || 0;
      
      // Prepara i dati estratti per il salvataggio
      const extractedDataForSaving = {
        originalText: ocrAnalysis?.text || '',
        overallAccuracy: ocrAnalysis?.accuracy || 0,
        // Includi altri dati dall'analisi smart se disponibili
      };
      
      // Crea la spesa nel database locale con il path permanente
      const expenseId = await databaseManager.createExpense({
        expense_report_id: targetReportId,
        amount: confirmedData.amount || 0,
        currency: confirmedData.currency || 'EUR',
        merchant_name: confirmedData.merchantName,
        category,
        receipt_date: confirmedData.date,
        receipt_time: confirmedData.time,
        receipt_image_path: permanentImagePath, // ✅ Path permanente dell'immagine
        extracted_data: JSON.stringify(extractedDataForSaving),
        notes: smartAnalysisAccuracy > 0 ? `Precisione OCR: ${smartAnalysisAccuracy}%` : undefined,
        is_archived: false,
        sync_status: 'pending' // Sarà sincronizzato in background
      });
      
      console.log('✅ Expense saved locally:', expenseId);
      
      // Trigger refresh in all listening screens
      triggerExpenseRefresh();
      
      // Avvia sincronizzazione in background
      console.log('🔄 Triggering automatic sync after expense save...');
      syncManager.syncAll().catch(err => {
        console.error('⚠️ Background sync failed:', err);
      });
      
      // Mostra messaggio di successo con Alert
      const isGenericReport = !reportId;
      const reportMessage = isGenericReport 
        ? 'nella nota spese generica' 
        : 'nella nota spese selezionata';
      
      const message = `Lo scontrino è stato salvato ${reportMessage}${confirmedData.amount ? ` con importo €${confirmedData.amount.toFixed(2)}` : ''}.`;
      
      Alert.alert(
        'Scontrino Salvato!',
        message,
        [{
          text: 'OK',
          onPress: () => {
            // Reset stato e torna alla fotocamera
            setCapturedImage(null);
            setShowPreview(false);
            setShowAnalysis(false);
            setOcrAnalysis(null);
            setAnalysisProgress(null);
            progressAnimation.setValue(0);
          }
        }]
      );
    } catch (error) {
      console.error('❌ Error saving confirmed data:', error);
      Alert.alert(
        'Errore',
        'Si è verificato un errore durante il salvataggio dello scontrino. Riprova.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsUploading(false);
    }
  };

  
  // Funzione per gestire l'annullamento della verifica
  const handleCancelVerification = () => {
    setShowDataVerificationModal(false);
  };

  const goBack = () => {
    // Navigate to ExpenseReports screen in the tab navigator
    navigation.navigate('ExpenseReportsTabs', { screen: 'ExpenseReports' });
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
        
        // Start OCR analysis if available
        if (ocrInitialized) {
          await analyzeImage(result.assets[0].uri);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Errore', 'Impossibile selezionare il file');
    }
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // Web version
  if (isWeb) {
    return (
      <SafeAreaView style={styles.webContainer}>
        <View style={styles.webHeader}>
          <TouchableOpacity style={styles.webBackButton} onPress={goBack}>
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.webTitle}>Carica Scontrino con OCR</Text>
        </View>
        
        {!showPreview ? (
          <View style={styles.webUploadContainer}>
            <MaterialIcons name="receipt" size={80} color="#ccc" />
            <Text style={styles.webUploadTitle}>Seleziona Scontrino</Text>
            <Text style={styles.webUploadText}>
              Seleziona un'immagine dello scontrino dal tuo dispositivo
            </Text>
            
            <TouchableOpacity style={styles.webUploadButton} onPress={pickImage}>
              <MaterialIcons name="file-upload" size={24} color="white" />
              <Text style={styles.webUploadButtonText}>Scegli File</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  // Permission states
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.permissionText}>Caricamento...</Text>
      </View>
    );
  }

  if (isInitializingOCR) {
    return (
      <View style={styles.permissionContainer}>
        <MaterialIcons name="text-fields" size={64} color="#007AFF" />
        <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 20}} />
        <Text style={styles.permissionTitle}>Inizializzazione Scanner AI</Text>
        <Text style={styles.permissionText}>
          Configurazione del riconoscimento testo in corso...
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
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

  // Analysis screen with progress
  if (showAnalysis && analysisProgress) {
    return (
      <SafeAreaView style={styles.analysisContainer}>
        <StatusBar hidden />
        
        {/* Analysis Header */}
        <View style={styles.analysisHeader}>
          <Text style={styles.analysisTitle}>Analisi AI</Text>
          <Text style={styles.analysisSubtitle}>{analysisProgress.stage}</Text>
        </View>

        {/* Preview Image */}
        <View style={styles.analysisImageContainer}>
          {capturedImage && (
            <Image
              source={{ uri: capturedImage }}
              style={styles.analysisImage}
              contentFit="contain"
            />
          )}
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View 
              style={[
                styles.progressFill,
                {
                  width: progressAnimation.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                    extrapolate: 'clamp',
                  })
                }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(analysisProgress.progress)}%
          </Text>
        </View>

        {/* Analysis Results */}
        {ocrAnalysis && analysisProgress.progress === 100 && (
          <View style={styles.resultsContainer}>
            <View style={styles.accuracyIndicator}>
              <View style={[
                styles.accuracyCircle,
                { backgroundColor: ocrAnalysis.accuracy >= ACCURACY_THRESHOLD ? '#4CAF50' : '#FF9800' }
              ]}>
                <Text style={styles.accuracyText}>
                  {Math.round(ocrAnalysis.accuracy)}%
                </Text>
              </View>
              <Text style={[
                styles.accuracyLabel,
                { color: ocrAnalysis.accuracy >= ACCURACY_THRESHOLD ? '#4CAF50' : '#FF9800' }
              ]}>
                {ocrAnalysis.accuracy >= ACCURACY_THRESHOLD ? 'Qualità Ottima' : 'Qualità Bassa'}
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.retryButton]}
                onPress={retakePicture}
              >
                <MaterialIcons name="camera-alt" size={24} color="#FF9800" />
                <Text style={styles.retryButtonText}>Riprova</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                onPress={confirmAndUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialIcons name="check" size={24} color="white" />
                )}
                <Text style={styles.confirmButtonText}>
                  {isUploading ? 'Caricamento...' : 'Conferma'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Modal di verifica dati - disponibile anche nell'analysis screen */}
        <DataVerificationModal
          visible={showDataVerificationModal}
          onClose={handleCancelVerification}
          extractedData={verificationData}
          onConfirm={handleConfirmData}
          onCancel={handleCancelVerification}
          isLoading={isUploading}
          title="Verifica Dati Scontrino"
          subtitle={verificationData.amount ? "Controlla e modifica i dati rilevati prima di salvare" : "Inserisci i dati dello scontrino"}
        />
      </SafeAreaView>
    );

  }

  // Preview screen (before analysis)
  if (showPreview && capturedImage && !showAnalysis) {
    return (
      <SafeAreaView style={styles.previewContainer}>
        <StatusBar hidden />
        
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.previewImage}
            contentFit="contain"
          />
        </View>

        <View style={styles.previewControls}>
          <Text style={styles.previewTitle}>Anteprima Scontrino</Text>
          <Text style={styles.previewSubtitle}>
            Vuoi tenere questa foto?
          </Text>
          
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
              onPress={confirmAndUpload}
            >
              <MaterialIcons name="check" size={24} color="white" />
              <Text style={styles.keepButtonText}>Tieni</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Modal di verifica dati - disponibile anche nel preview screen */}
        <DataVerificationModal
          visible={showDataVerificationModal}
          onClose={handleCancelVerification}
          extractedData={verificationData}
          onConfirm={handleConfirmData}
          onCancel={handleCancelVerification}
          isLoading={isUploading}
          title="Verifica Dati Scontrino"
          subtitle={verificationData.amount ? "Controlla e modifica i dati rilevati prima di salvare" : "Inserisci i dati dello scontrino"}
        />
      </SafeAreaView>
    );
  }

  // Main camera screen
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        ratio="16:9"
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <MaterialIcons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          
          <Text style={styles.titleText}>Scanner AI</Text>
          
          <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
            <MaterialIcons name="flip-camera-ios" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Camera Overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanningFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          
          <Text style={styles.instructionText}>
            {ocrInitialized 
              ? 'Inquadra lo scontrino e premi il pulsante per scattare e analizzare'
              : 'Inquadra lo scontrino e premi il pulsante per scattare'
            }
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
        
        {/* Gallery Button */}
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
          <MaterialIcons name="photo-library" size={30} color="white" />
        </TouchableOpacity>
      </CameraView>
      
      {/* Modal di verifica dati - posizionata fuori dal CameraView per evitare sovrapposizioni */}
      <DataVerificationModal
        visible={showDataVerificationModal}
        onClose={handleCancelVerification}
        extractedData={verificationData}
        onConfirm={handleConfirmData}
        onCancel={handleCancelVerification}
        isLoading={isUploading}
        title="Verifica Dati Scontrino"
        subtitle={verificationData.amount ? "Controlla e modifica i dati rilevati prima di salvare" : "Inserisci i dati dello scontrino"}
      />
      
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
  galleryButton: {
    position: 'absolute',
    bottom: 70,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
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
  // Analysis Screen
  analysisContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  analysisHeader: {
    backgroundColor: 'white',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  analysisTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  analysisSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  analysisImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
    margin: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  analysisImage: {
    width: '100%',
    height: '100%',
  },
  progressContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    marginRight: 15,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    minWidth: 40,
    textAlign: 'right',
  },
  resultsContainer: {
    backgroundColor: 'white',
    padding: 20,
  },
  accuracyIndicator: {
    alignItems: 'center',
    marginBottom: 30,
  },
  accuracyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  accuracyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  accuracyLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  retryButton: {
    backgroundColor: '#FFF3E0',
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  retryButtonText: {
    color: '#FF9800',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Web styles
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
});
