import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_MODE_KEY = '@offline_mode_enabled';

const OfflineContext = createContext({});

export const useOffline = () => useContext(OfflineContext);

export const OfflineProvider = ({ children }) => {
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOfflineMode();
  }, []);

  const loadOfflineMode = async () => {
    try {
      const saved = await AsyncStorage.getItem(OFFLINE_MODE_KEY);
      setIsOfflineMode(saved === 'true');
    } catch (error) {
      console.error('Failed to load offline mode setting', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleOfflineMode = async (enabled) => {
    try {
      await AsyncStorage.setItem(OFFLINE_MODE_KEY, enabled.toString());
      setIsOfflineMode(enabled);
    } catch (error) {
      console.error('Failed to save offline mode setting', error);
    }
  };

  return (
    <OfflineContext.Provider value={{ isOfflineMode, toggleOfflineMode, loading }}>
      {children}
    </OfflineContext.Provider>
  );
};