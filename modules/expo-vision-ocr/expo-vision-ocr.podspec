require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'expo-vision-ocr'
  s.version        = package['version']
  s.summary        = 'Apple Vision OCR native module for Expo'
  s.description    = 'A native iOS module that provides OCR capabilities using Apple\'s Vision framework for Expo applications'
  s.license        = package['license']
  s.author         = 'Expense Tracker'
  s.homepage       = 'https://github.com/expense-tracker/expo-vision-ocr'
  s.platforms      = { :ios => '13.0' }
  s.source         = { :git => 'https://github.com/expense-tracker/expo-vision-ocr.git', :tag => s.version }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.source_files = "src/**/*.{h,m,mm,swift,hpp,cpp}"
  s.ios.framework = 'Vision'
  
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
