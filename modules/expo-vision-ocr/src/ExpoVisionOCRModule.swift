import ExpoModulesCore
import Vision
import UIKit
import CoreImage

public class ExpoVisionOCRModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVisionOCR")
    
    AsyncFunction("isAvailable") { () -> Bool in
      return true // Vision framework is available on iOS 11+
    }
    
    AsyncFunction("extractTextFromImage") { (imageUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        self.performOCR(imageUri: imageUri, promise: promise)
      }
    }
  }
  
  private func performOCR(imageUri: String, promise: Promise) {
    guard let url = URL(string: imageUri),
          let image = self.loadImage(from: url) else {
      promise.reject("INVALID_IMAGE", "Could not load image from URI: \(imageUri)")
      return
    }
    
    guard let cgImage = image.cgImage else {
      promise.reject("INVALID_IMAGE", "Could not convert UIImage to CGImage")
      return
    }
    
    let request = VNRecognizeTextRequest { (request, error) in
      if let error = error {
        promise.reject("OCR_ERROR", "Vision OCR failed: \(error.localizedDescription)")
        return
      }
      
      guard let observations = request.results as? [VNRecognizedTextObservation] else {
        promise.reject("OCR_ERROR", "No text observations found")
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
        promise.resolve(result)
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
      promise.reject("OCR_ERROR", "Failed to perform OCR: \(error.localizedDescription)")
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
