import { Platform } from 'react-native';
import VisionOCR, { VisionOCRResult } from '../src/services/nativeVisionOCR';

export interface OCRResult {
  text: string;
  confidence: number;
  method: 'vision';
  processingTime: number;
}

class VisionOCRService {
  private isVisionAvailable: boolean | null = null;
  private nativeModuleAvailable: boolean = false;

  /**
   * Initialize and check if native OCR is available
   */
  async initialize(): Promise<boolean> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      console.log('🔍 Native OCR is only available on iOS and Android; OCR analysis disabled');
      this.nativeModuleAvailable = false;
      this.isVisionAvailable = false;
      return false;
    }

    try {
      // First check if the native module is available
      const isAvailable = await VisionOCR.isAvailable();
      this.nativeModuleAvailable = true;
      this.isVisionAvailable = isAvailable;
      console.log(`🔍 Native OCR available on ${Platform.OS}: ${this.isVisionAvailable}`);
      return this.isVisionAvailable;
    } catch (error) {
      console.error('❌ Native OCR module not available; OCR analysis disabled:', error);
      this.nativeModuleAvailable = false;
      this.isVisionAvailable = false;
      return false;
    }
  }

  /**
   * Extract text from image using the platform native OCR engine.
   */
  async extractTextFromImage(imageUri: string): Promise<OCRResult> {
    const startTime = Date.now();

    // Ensure Vision is available
    if (this.isVisionAvailable === null) {
      await this.initialize();
    }

    if (!this.isVisionAvailable) {
      throw new Error('Native OCR is not available on this device');
    }

    try {
      console.log(`🔍 Starting native OCR on ${Platform.OS} for image:`, imageUri);
      
      const result: VisionOCRResult = await VisionOCR.extractTextFromImage(imageUri);
      const processingTime = Date.now() - startTime;

      console.log(`✅ Native OCR completed in ${processingTime}ms`);
      console.log(`📝 Extracted text (${result.text.length} chars):`, result.text.substring(0, 100) + '...');
      console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);

      return {
        text: result.text,
        confidence: result.confidence,
        method: 'vision',
        processingTime
      };
    } catch (error) {
      console.error('❌ Native OCR failed:', error);
      throw new Error(`Native OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process receipt image and extract text with metadata
   */
  async processReceiptImage(imageUri: string): Promise<{
    extractedText: string;
    confidence: number;
    metadata: {
      method: string;
      processingTime: number;
      textLength: number;
      linesCount: number;
    };
  }> {
    try {
      const result = await this.extractTextFromImage(imageUri);
      
      const lines = result.text.split('\n').filter(line => line.trim().length > 0);
      
      return {
        extractedText: result.text,
        confidence: result.confidence,
        metadata: {
          method: result.method,
          processingTime: result.processingTime,
          textLength: result.text.length,
          linesCount: lines.length
        }
      };
    } catch (error) {
      console.error('❌ Error processing receipt image:', error);
      throw error;
    }
  }

  /**
   * Check if Vision OCR is ready to use
   */
  isReady(): boolean {
    return this.isVisionAvailable === true;
  }

  /**
   * Get OCR capabilities info
   */
  getCapabilities() {
    return {
      visionAvailable: this.isVisionAvailable,
      platform: Platform.OS,
      features: {
        multiLanguage: Platform.OS === 'ios' || Platform.OS === 'android',
        boundingBoxes: Platform.OS === 'ios' || Platform.OS === 'android',
        highAccuracy: Platform.OS === 'ios' || Platform.OS === 'android'
      }
    };
  }
}

export const visionOCRService = new VisionOCRService();
