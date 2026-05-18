package it.welfy.expensetracker

import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

class VisionOCRModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private val recognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  }

  override fun getName(): String = "VisionOCRModule"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun extractTextFromImage(imageUri: String, promise: Promise) {
    try {
      val image = loadInputImage(imageUri)

      recognizer.process(image)
        .addOnSuccessListener { visionText ->
          val boundingBoxes = Arguments.createArray()
          var confidenceTotal = 0.0
          var confidenceWeightTotal = 0.0

          visionText.textBlocks.forEach { block ->
            block.lines.forEach { line ->
              val frame = line.boundingBox
              val lineConfidence = normalizeConfidence(line.confidence.toDouble())
              val lineWeight = line.text.trim().length.coerceAtLeast(1).toDouble()
              val lineMap = Arguments.createMap().apply {
                putString("text", line.text)
                putDouble("x", frame?.left?.toDouble() ?: 0.0)
                putDouble("y", frame?.top?.toDouble() ?: 0.0)
                putDouble("width", frame?.width()?.toDouble() ?: 0.0)
                putDouble("height", frame?.height()?.toDouble() ?: 0.0)
                putDouble("confidence", lineConfidence)
              }
              boundingBoxes.pushMap(lineMap)
              confidenceTotal += lineConfidence * lineWeight
              confidenceWeightTotal += lineWeight
            }
          }

          val result = Arguments.createMap().apply {
            putString("text", visionText.text.trim())
            putDouble("confidence", if (confidenceWeightTotal > 0) confidenceTotal / confidenceWeightTotal else 0.0)
            putArray("boundingBoxes", boundingBoxes)
          }

          promise.resolve(result)
        }
        .addOnFailureListener { error ->
          promise.reject("OCR_ERROR", "ML Kit OCR failed: ${error.localizedMessage}", error)
        }
    } catch (error: Exception) {
      promise.reject("INVALID_IMAGE", "Could not load image from URI: $imageUri", error)
    }
  }

  private fun loadInputImage(imageUri: String): InputImage {
    val uri = parseImageUri(imageUri)

    return try {
      InputImage.fromFilePath(reactContext, uri)
    } catch (_: Exception) {
      val path = if (uri.scheme == "file") uri.path else imageUri
      val bitmap = BitmapFactory.decodeFile(path)
        ?: throw IllegalArgumentException("Unable to decode image file")
      InputImage.fromBitmap(bitmap, 0)
    }
  }

  private fun normalizeConfidence(confidence: Double): Double {
    return if (confidence.isNaN() || confidence.isInfinite()) {
      0.0
    } else {
      confidence.coerceIn(0.0, 1.0)
    }
  }

  private fun parseImageUri(imageUri: String): Uri {
    if (imageUri.startsWith("file://") || imageUri.startsWith("content://")) {
      return Uri.parse(imageUri)
    }

    return Uri.fromFile(File(imageUri))
  }
}
