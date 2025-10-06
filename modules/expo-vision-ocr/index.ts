import { NativeModule, requireNativeModule } from 'expo';

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

export interface VisionOCRModule extends NativeModule {
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

// Native module will be implemented in Swift
let visionOCRModule: VisionOCRModule | null = null;

try {
  // Try the modern Expo Modules way first
  const { ExpoVisionOCR } = globalThis.expo?.modules ?? {};
  if (ExpoVisionOCR) {
    visionOCRModule = ExpoVisionOCR as VisionOCRModule;
  } else {
    // Fallback to legacy method
    visionOCRModule = requireNativeModule('ExpoVisionOCR') as VisionOCRModule;
  }
} catch (error) {
  console.warn('⚠️ ExpoVisionOCR native module not available. Error:', error);
}

// Create a fallback module that throws meaningful errors
const fallbackModule: VisionOCRModule = {
  async isAvailable(): Promise<boolean> {
    return false;
  },
  
  async extractTextFromImage(_imageUri: string): Promise<VisionOCRResult> {
    throw new Error('ExpoVisionOCR native module is not available. Please rebuild the app after adding the vision-ocr plugin.');
  }
} as VisionOCRModule;

export default visionOCRModule || fallbackModule;
