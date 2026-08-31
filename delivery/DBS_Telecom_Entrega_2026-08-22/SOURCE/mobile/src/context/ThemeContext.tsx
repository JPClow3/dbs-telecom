import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  LIGHT_COLORS,
  DARK_COLORS,
  DEPARTMENTS,
  DARK_DEPARTMENTS,
  getThemeColors,
  getThemeDepartments,
} from '../constants/theme';
import { storageService, ThemeMode } from '../services/storage';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: typeof LIGHT_COLORS;
  departments: typeof DEPARTMENTS;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  isDark: false,
  colors: LIGHT_COLORS,
  departments: DEPARTMENTS,
  setThemeMode: async () => {},
  toggleTheme: async () => {},
});

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadSavedTheme() {
      const saved = await storageService.getThemeMode();
      if (saved) {
        setThemeModeState(saved);
      }
      setIsLoaded(true);
    }
    loadSavedTheme();
  }, []);

  const isDark =
    themeMode === 'system'
      ? systemColorScheme === 'dark'
      : themeMode === 'dark';

  const colors = getThemeColors(isDark);
  const departments = getThemeDepartments(isDark);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await storageService.saveThemeMode(mode);
  };

  const toggleTheme = async () => {
    const nextMode: ThemeMode = isDark ? 'light' : 'dark';
    await setThemeMode(nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        isDark,
        colors,
        departments,
        setThemeMode,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
