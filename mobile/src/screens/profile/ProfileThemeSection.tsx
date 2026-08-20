import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Moon, Smartphone, Sun } from 'lucide-react-native';
import { ThemeMode } from '../../services/storage';
import { ProfileColors } from './types';
import { styles } from './styles';

interface ProfileThemeSectionProps {
  colors: ProfileColors;
  isDark: boolean;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export const ProfileThemeSection: React.FC<ProfileThemeSectionProps> = ({
  colors,
  isDark,
  themeMode,
  onThemeChange,
}) => (
  <View
    style={[
      styles.sectionCard,
      {
        backgroundColor: colors.card,
        borderColor: colors.border,
      },
    ]}
  >
    <View style={[styles.sectionHeader, { borderBottomColor: colors.borderLight }]}>
      <View style={styles.headerLeft}>
        {isDark ? (
          <Moon size={16} color={colors.primary} strokeWidth={2.2} />
        ) : (
          <Sun size={16} color={colors.primary} strokeWidth={2.2} />
        )}
        <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Aparência do Aplicativo</Text>
      </View>
    </View>

    <View style={styles.themeSelectorRow}>
      <TouchableOpacity
        style={[
          styles.themeOptionBtn,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
          themeMode === 'system' && [
            styles.themeOptionBtnActive,
            {
              backgroundColor: colors.primaryUltraLight,
              borderColor: colors.primary,
            },
          ],
        ]}
        onPress={() => onThemeChange('system')}
        activeOpacity={0.75}
      >
        <Smartphone
          size={15}
          color={themeMode === 'system' ? colors.primary : colors.textMuted}
          strokeWidth={2.2}
        />
        <Text
          style={[
            styles.themeOptionText,
            { color: colors.textMuted },
            themeMode === 'system' && { color: colors.primary, fontWeight: '800' },
          ]}
        >
          Automático
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.themeOptionBtn,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
          themeMode === 'light' && [
            styles.themeOptionBtnActive,
            {
              backgroundColor: colors.primaryUltraLight,
              borderColor: colors.primary,
            },
          ],
        ]}
        onPress={() => onThemeChange('light')}
        activeOpacity={0.75}
      >
        <Sun
          size={15}
          color={themeMode === 'light' ? colors.primary : colors.textMuted}
          strokeWidth={2.2}
        />
        <Text
          style={[
            styles.themeOptionText,
            { color: colors.textMuted },
            themeMode === 'light' && { color: colors.primary, fontWeight: '800' },
          ]}
        >
          Claro
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.themeOptionBtn,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
          },
          themeMode === 'dark' && [
            styles.themeOptionBtnActive,
            {
              backgroundColor: colors.primaryUltraLight,
              borderColor: colors.primary,
            },
          ],
        ]}
        onPress={() => onThemeChange('dark')}
        activeOpacity={0.75}
      >
        <Moon
          size={15}
          color={themeMode === 'dark' ? colors.primary : colors.textMuted}
          strokeWidth={2.2}
        />
        <Text
          style={[
            styles.themeOptionText,
            { color: colors.textMuted },
            themeMode === 'dark' && { color: colors.primary, fontWeight: '800' },
          ]}
        >
          Escuro
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);
