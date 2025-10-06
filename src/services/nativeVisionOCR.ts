import { NativeModules } from 'react-native';
import VisionOCRNative from 'react-native-vision-ocr';

export interface VisionOCRResult {
  text: string;
  confidence: number;
  boundingBoxes?: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
}

export interface VisionOCRModule {
  /**
   * Extract text from image using Apple's Vision framework
   * @param imageUri Local URI of the image to process
   * @returns Promise with extracted text and confidence
   */
  extractTextFromImage(imageUri: string): Promise<VisionOCRResult>;
  
  /**
   * Check if Vision OCR is available on this device
   * @returns Promise<boolean>
   */
  isAvailable(): Promise<boolean>;
}

// Debug logging
console.log('🔍 Available NativeModules keys:', Object.keys(NativeModules));
console.log('🔍 VisionOCRModule from package:', VisionOCRNative);
console.log('🔍 VisionOCRModule from NativeModules:', NativeModules.VisionOCRModule);

// Use the package import
const NativeVisionOCR = VisionOCRNative;

// Create a fallback module that throws meaningful errors
const fallbackModule: VisionOCRModule = {
  async isAvailable(): Promise<boolean> {
    console.log('⚠️ Using fallback module - native module not available');
    return false;
  },
  
  async extractTextFromImage(_imageUri: string): Promise<VisionOCRResult> {
    throw new Error('VisionOCRModule native module is not available. Please rebuild the app after adding the vision-ocr functionality.');
  }
};

export default (NativeVisionOCR as VisionOCRModule) || fallbackModule;
