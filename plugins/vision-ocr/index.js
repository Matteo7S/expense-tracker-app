const { createRunOncePlugin, withXcodeProject } = require('expo/config-plugins');

const withVisionOCR = (config) => {
  // Add iOS frameworks and permissions
  if (!config.ios) config.ios = {};
  if (!config.ios.infoPlist) config.ios.infoPlist = {};
  
  // Add camera usage description (required for Vision framework when processing images)
  config.ios.infoPlist.NSCameraUsageDescription = 
    config.ios.infoPlist.NSCameraUsageDescription || 
    'This app uses the camera to scan receipts for expense tracking.';

  // Add Vision framework to project
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    
    // Add Vision framework
    xcodeProject.addFramework('Vision.framework');
    
    return config;
  });

  return config;
};

module.exports = createRunOncePlugin(withVisionOCR, 'vision-ocr');
