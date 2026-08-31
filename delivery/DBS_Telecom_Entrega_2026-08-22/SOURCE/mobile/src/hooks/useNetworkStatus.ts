import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string;
  refresh?: () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    connectionType: 'unknown',
  });

  useEffect(() => {
    // 1. Web listener fallback
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const updateWebStatus = () => {
        const online = navigator.onLine;
        setStatus({
          isConnected: online,
          isInternetReachable: online,
          connectionType: online ? 'wifi' : 'none',
        });
      };

      window.addEventListener('online', updateWebStatus);
      window.addEventListener('offline', updateWebStatus);
      updateWebStatus();

      return () => {
        window.removeEventListener('online', updateWebStatus);
        window.removeEventListener('offline', updateWebStatus);
      };
    }

    // 2. React Native NetInfo listener (iOS / Android)
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? true;
      const reachable = state.isInternetReachable ?? connected;
      setStatus({
        isConnected: connected && (reachable !== false),
        isInternetReachable: reachable,
        connectionType: state.type || 'unknown',
      });
    });

    // Leitura inicial
    NetInfo.fetch().then((state) => {
      const connected = state.isConnected ?? true;
      const reachable = state.isInternetReachable ?? connected;
      setStatus({
        isConnected: connected && (reachable !== false),
        isInternetReachable: reachable,
        connectionType: state.type || 'unknown',
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const refresh = async () => {
    if (Platform.OS === 'web') {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      setStatus({
        isConnected: online,
        isInternetReachable: online,
        connectionType: online ? 'wifi' : 'none',
        refresh,
      });
      return;
    }

    const state = await NetInfo.fetch();
    const connected = state.isConnected ?? true;
    const reachable = state.isInternetReachable ?? connected;
    setStatus({
      isConnected: connected && reachable !== false,
      isInternetReachable: reachable,
      connectionType: state.type || 'unknown',
      refresh,
    });
  };

  return { ...status, refresh };
}
