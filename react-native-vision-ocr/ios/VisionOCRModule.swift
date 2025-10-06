import Foundation
import React
import Vision
import UIKit
import CoreImage

@objc(VisionOCRModule)
class VisionOCRModule: NSObject, RCTBridgeModule {
  
  @objc
  static func moduleName() -> String {
    return "VisionOCRModule"
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  @objc
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(true) // Vision framework is available on iOS 11+
  }
  
  @objc
  func extractTextFromImage(_ imageUri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      self.performOCR(imageUri: imageUri, resolve: resolve, reject: reject)
    }
  }
  
  private func performOCR(imageUri: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let url = URL(string: imageUri),
          let image = self.loadImage(from: url) else {
      reject("INVALID_IMAGE", "Could not load image from URI: \(imageUri)", nil)
      return
    }
    
    guard let cgImage = image.cgImage else {
      reject("INVALID_IMAGE", "Could not convert UIImage to CGImage", nil)
      return
    }
    
    let request = VNRecognizeTextRequest { (request, error) in
      if let error = error {
        reject("OCR_ERROR", "Vision OCR failed: \(error.localizedDescription)", error)
        return
      }
      
      guard let observations = request.results as? [VNRecognizedTextObservation] else {
        reject("OCR_ERROR", "No text observations found", nil)
        return
      }
      
      var extractedText = ""
      var totalConfidence: Float = 0.0
      var boundingBoxes: [[String: Any]] = []
      
      for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        
        extractedText += candidate.string + "\n"
        totalConfidence += candidate.confidence
        
        // Extract bounding box information
        let boundingBox = observation.boundingBox
        let boxInfo: [String: Any] = [
          "text": candidate.string,
          "x": boundingBox.origin.x,
          "y": boundingBox.origin.y,
          "width": boundingBox.size.width,
          "height": boundingBox.size.height,
          "confidence": candidate.confidence
        ]
        boundingBoxes.append(boxInfo)
      }
      
      let averageConfidence = observations.isEmpty ? 0.0 : totalConfidence / Float(observations.count)
      
      let result: [String: Any] = [
        "text": extractedText.trimmingCharacters(in: .whitespacesAndNewlines),
        "confidence": averageConfidence,
        "boundingBoxes": boundingBoxes
      ]
      
      DispatchQueue.main.async {
        resolve(result)
      }
    }
    
    // Configure request for better accuracy
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    
    // Support multiple languages (especially useful for receipts)
    request.recognitionLanguages = ["en-US", "it-IT", "de-DE", "fr-FR", "es-ES"]
    
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    
    do {
      try handler.perform([request])
    } catch {
      reject("OCR_ERROR", "Failed to perform OCR: \(error.localizedDescription)", error)
    }
  }
  
  private func loadImage(from url: URL) -> UIImage? {
    if url.isFileURL {
      // Local file
      return UIImage(contentsOfFile: url.path)
    } else if url.scheme == "data" {
      // Data URI
      guard let data = try? Data(contentsOf: url) else { return nil }
      return UIImage(data: data)
    } else {
      // For other schemes, try to load as data
      guard let data = try? Data(contentsOf: url) else { return nil }
      return UIImage(data: data)
    }
  }
}
