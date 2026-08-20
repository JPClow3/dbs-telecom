import React from 'react';
import { Switch, Text, View } from 'react-native';
import { Fingerprint, Lock, ScanFace, ShieldCheck } from 'lucide-react-native';
import { BiometricCapability } from '../../services/biometrics';
import { ProfileColors } from './types';
import { styles } from './styles';

interface ProfileSecuritySectionProps {
  colors: ProfileColors;
  biometricCap: BiometricCapability;
  biometricsEnabled: boolean;
  onToggleBiometrics: (value: boolean) => void;
}

export const ProfileSecuritySection: React.FC<ProfileSecuritySectionProps> = ({
  colors,
  biometricCap,
  biometricsEnabled,
  onToggleBiometrics,
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
        <ShieldCheck size={16} color={colors.primary} strokeWidth={2.2} />
        <Text style={[styles.sectionTitle, { color: colors.secondary }]}>Segurança & Acesso</Text>
      </View>
    </View>

    <View style={[styles.biometricRow, { borderBottomColor: colors.borderLight }]}>
      <View style={styles.biometricRowLeft}>
        {biometricCap.biometryType === 'FACIAL_RECOGNITION' ? (
          <ScanFace size={20} color={colors.primary} strokeWidth={2.2} />
        ) : (
          <Fingerprint size={20} color={colors.primary} strokeWidth={2.2} />
        )}
        <View>
          <Text style={[styles.biometricLabel, { color: colors.text }]}>
            {biometricCap.label || 'Biometria'}
          </Text>
          <Text style={[styles.biometricSubLabel, { color: colors.textMuted }]}>
            {biometricsEnabled ? 'Login rápido ativado' : 'Ativar acesso rápido sem digitar CPF'}
          </Text>
        </View>
      </View>
      <Switch
        value={biometricsEnabled}
        onValueChange={onToggleBiometrics}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>

    {biometricsEnabled && (
      <View style={[styles.securityInfoRow, { backgroundColor: colors.successLight }]}>
        <Lock size={13} color={colors.successDark} strokeWidth={2.5} />
        <Text style={[styles.securityInfoText, { color: colors.successDark }]}>
          Dados protegidos pelo enclave seguro do dispositivo
        </Text>
      </View>
    )}
  </View>
);
