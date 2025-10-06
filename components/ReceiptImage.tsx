/**
 * Componente per visualizzare immagini scontrino con gestione thumbnail
 */

import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  StatusBar,
  Text,
  ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { Expense } from '../services/database';

interface ReceiptImageProps {
  expense: Expense;
  style?: any;
  thumbnailHeight?: number;
  showFullscreenButton?: boolean;
}

export const ReceiptImage: React.FC<ReceiptImageProps> = ({
  expense,
  style,
  thumbnailHeight = 150,
  showFullscreenButton = true
}) => {
  const [showFullImage, setShowFullImage] = useState(false);
  const [thumbnailLoading, setThumbnailLoading] = useState(true);
  const [fullImageLoading, setFullImageLoading] = useState(true);

  const getThumbnailSource = () => {
    // Preferisci il thumbnail per la vista anteprima
    if (expense.receipt_thumbnail_url) {
      return { uri: expense.receipt_thumbnail_url };
    }
    
    // Fallback all'immagine completa
    if (expense.receipt_image_url) {
      return { uri: expense.receipt_image_url };
    }
    
    // Fallback all'immagine locale
    if (expense.receipt_image_path) {
      return { uri: expense.receipt_image_path };
    }
    
    return null;
  };

  const getFullImageSource = () => {
    // Per la vista a schermo intero, usa sempre l'immagine originale se disponibile
    if (expense.receipt_image_url) {
      return { uri: expense.receipt_image_url };
    }
    
    // Fallback al thumbnail se l'originale non è disponibile
    if (expense.receipt_thumbnail_url) {
      return { uri: expense.receipt_thumbnail_url };
    }
    
    // Fallback all'immagine locale
    if (expense.receipt_image_path) {
      return { uri: expense.receipt_image_path };
    }
    
    return null;
  };

  const getSyncStatus = () => {
    if (expense.receipt_image_url && expense.receipt_thumbnail_url) {
      return { status: 'synced', text: 'Online', color: '#28a745' };
    } else if (expense.receipt_image_path) {
      return { status: 'local', text: 'Solo locale', color: '#f0ad4e' };
    } else {
      return { status: 'none', text: 'Nessuna immagine', color: '#6c757d' };
    }
  };

  const thumbnailSource = getThumbnailSource();
  const fullImageSource = getFullImageSource();
  const syncStatus = getSyncStatus();

  if (!thumbnailSource) {
    return (
      <View style={[styles.noImageContainer, style, { height: thumbnailHeight }]}>
        <Text style={styles.noImageText}>📷</Text>
        <Text style={styles.noImageLabel}>Nessuna immagine</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, style]}>
        <TouchableOpacity 
          onPress={showFullscreenButton ? () => setShowFullImage(true) : undefined}
          style={styles.imageContainer}
          disabled={!showFullscreenButton}
        >
          <Image
            source={thumbnailSource}
            style={[styles.thumbnailImage, { height: thumbnailHeight }]}
            contentFit="cover"
            onLoadStart={() => setThumbnailLoading(true)}
            onLoad={() => setThumbnailLoading(false)}
          />
          
          {thumbnailLoading && (
            <View style={[styles.loadingOverlay, { height: thumbnailHeight }]}>
              <ActivityIndicator size="small" color="#007bff" />
            </View>
          )}

          {showFullscreenButton && (
            <View style={styles.imageOverlay}>
              <Text style={styles.overlayText}>Tocca per ingrandire</Text>
            </View>
          )}

          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: syncStatus.color }]}>
            <Text style={styles.statusText}>{syncStatus.text}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Modal per immagine a schermo intero */}
      <Modal
        visible={showFullImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullImage(false)}
      >
        <View style={styles.modalContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          <TouchableOpacity 
            style={styles.modalCloseButton}
            onPress={() => setShowFullImage(false)}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          
          {fullImageSource && (
            <View style={styles.fullImageContainer}>
              <Image
                source={fullImageSource}
                style={styles.fullImage}
                contentFit="contain"
                onLoadStart={() => setFullImageLoading(true)}
                onLoad={() => setFullImageLoading(false)}
              />
              
              {fullImageLoading && (
                <View style={styles.fullImageLoadingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.loadingText}>Caricamento immagine...</Text>
                </View>
              )}
              
              {/* Informazioni immagine */}
              <View style={styles.imageInfo}>
                <Text style={styles.imageInfoText}>
                  {expense.receipt_image_url ? 'Immagine online' : 'Immagine locale'}
                </Text>
                {expense.receipt_date && (
                  <Text style={styles.imageInfoText}>
                    {new Date(expense.receipt_date).toLocaleDateString('it-IT')}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden'
  },
  imageContainer: {
    position: 'relative'
  },
  thumbnailImage: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 249, 250, 0.8)',
    borderRadius: 8
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8
  },
  overlayText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500'
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600'
  },
  noImageContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderStyle: 'dashed'
  },
  noImageText: {
    fontSize: 32,
    marginBottom: 8
  },
  noImageLabel: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 24
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  fullImageContainer: {
    flex: 1,
    width: width,
    height: height,
    position: 'relative'
  },
  fullImage: {
    flex: 1,
    width: '100%',
    height: '100%'
  },
  fullImageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)'
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500'
  },
  imageInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  imageInfoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500'
  }
});
