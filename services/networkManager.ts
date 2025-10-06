/**
 * Network Manager
 * 
 * Gestisce la connettività di rete e fornisce hooks per reagire ai cambiamenti
 * di stato della connessione internet
 */

import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string | null;
  isExpensive?: boolean;
}

class NetworkManager {
  private listeners: Array<(state: NetworkState) => void> = [];
  private currentState: NetworkState = {
    isConnected: false,
    isInternetReachable: false,
    type: null
  };
  
  async initialize(): Promise<void> {
    console.log('🌐 Initializing Network Manager...');
    
    // Ottieni stato iniziale
    const initialState = await NetInfo.fetch();
    this.updateState(initialState);
    
    // Sottoscrivi ai cambiamenti
    NetInfo.addEventListener((state) => {
      this.updateState(state);
    });
    
    console.log('✅ Network Manager initialized');
  }
  
  private updateState(netInfoState: any): void {
    const newState: NetworkState = {
      isConnected: netInfoState.isConnected ?? false,
      isInternetReachable: netInfoState.isInternetReachable ?? false,
      type: netInfoState.type,
      isExpensive: netInfoState.details?.isConnectionExpensive
    };
    
    // Notifica solo se lo stato è cambiato
    if (this.hasStateChanged(newState)) {
      console.log('🌐 Network state changed:', newState);
      this.currentState = newState;
      this.notifyListeners(newState);
    }
  }
  
  private hasStateChanged(newState: NetworkState): boolean {
    return (
      newState.isConnected !== this.currentState.isConnected ||
      newState.isInternetReachable !== this.currentState.isInternetReachable ||
      newState.type !== this.currentState.type
    );
  }
  
  private notifyListeners(state: NetworkState): void {
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in network listener:', error);
      }
    });
  }
  
  /**
   * Registra un listener per i cambiamenti di rete
   */
  addListener(listener: (state: NetworkState) => void): () => void {
    this.listeners.push(listener);
    
    // Chiama immediatamente con lo stato corrente
    listener(this.currentState);
    
    // Ritorna funzione per rimuovere il listener
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Ottieni lo stato corrente della rete
   */
  getCurrentState(): NetworkState {
    return { ...this.currentState };
  }
  
  /**
   * Verifica se siamo online
   */
  isOnline(): boolean {
    return this.currentState.isConnected && this.currentState.isInternetReachable;
  }
  
  /**
   * Verifica se la connessione è costosa (dati mobili)
   */
  isExpensive(): boolean {
    return this.currentState.isExpensive ?? false;
  }
  
  /**
   * Forza un refresh dello stato di rete
   */
  async refresh(): Promise<NetworkState> {
    const state = await NetInfo.fetch();
    this.updateState(state);
    return this.getCurrentState();
  }
  
  /**
   * Cleanup risorse
   */
  dispose(): void {
    this.listeners = [];
  }
}

export const networkManager = new NetworkManager();

/**
 * Hook React per usare lo stato di rete nei componenti
 */
export function useNetworkState(): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>(
    networkManager.getCurrentState()
  );
  
  useEffect(() => {
    const unsubscribe = networkManager.addListener(setNetworkState);
    return unsubscribe;
  }, []);
  
  return networkState;
}

/**
 * Hook per verificare se siamo online
 */
export function useIsOnline(): boolean {
  const networkState = useNetworkState();
  return networkState.isConnected && networkState.isInternetReachable;
}
