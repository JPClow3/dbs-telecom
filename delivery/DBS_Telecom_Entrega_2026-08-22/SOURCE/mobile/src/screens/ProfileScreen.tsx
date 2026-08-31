import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView } from 'react-native';
import { Toast, ToastType } from '../components/Toast';
import { Customer } from '../types';
import { useAppTheme } from '../context/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hapticFeedback } from '../utils/haptics';
import { copyToClipboard } from '../utils/clipboard';
import { ThemeMode } from '../services/storage';
import { biometricsService, BiometricCapability } from '../services/biometrics';
import { ProfileHero } from './profile/ProfileHero';
import { ProfileThemeSection } from './profile/ProfileThemeSection';
import { ProfileDiagnosticsSection } from './profile/ProfileDiagnosticsSection';
import { ProfileQuickAccessSection } from './profile/ProfileQuickAccessSection';
import { ProfileAccountSection } from './profile/ProfileAccountSection';
import { ProfileSecuritySection } from './profile/ProfileSecuritySection';
import { ProfileToolShortcuts } from './profile/ProfileToolShortcuts';
import { ProfileModalStack } from './profile/ProfileModalStack';
import { PingResult } from './profile/types';
import { styles } from './profile/styles';

interface ProfileScreenProps {
  customer: Customer;
  onLogout: () => void;
  onNavigateToTab?: (tab: 'CHAT' | 'INVOICES' | 'PLANS' | 'PROFILE') => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  customer,
  onLogout,
  onNavigateToTab,
}) => {
  const { colors, isDark, themeMode, setThemeMode } = useAppTheme();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isNetworkOnline = isConnected && isInternetReachable !== false;

  const [toastInfo, setToastInfo] = useState<{ message: string; type: ToastType } | null>(null);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [showSpeedTestModal, setShowSpeedTestModal] = useState(false);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showOpticalModal, setShowOpticalModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricCap, setBiometricCap] = useState<BiometricCapability | null>(null);
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  useEffect(() => {
    const loadBiometrics = async () => {
      const cap = await biometricsService.checkCapabilities();
      setBiometricCap(cap);
      const isEnabled = await biometricsService.isEnabled();
      setBiometricsEnabled(isEnabled);
    };
    loadBiometrics();
  }, []);

  const showToast = (message: string, type: ToastType = 'SUCCESS') => {
    setToastInfo({ message, type });
  };

  const handleToggleBiometrics = async (value: boolean) => {
    hapticFeedback.selection();
    if (value) {
      const result = await biometricsService.authenticate(
        `Ativar ${biometricCap?.label || 'Biometria'} para a DBS Telecom`
      );
      if (result.success) {
        await biometricsService.enableForCustomer(customer);
        setBiometricsEnabled(true);
        hapticFeedback.success();
        showToast(`${biometricCap?.label || 'Biometria'} ativada com sucesso!`);
      } else {
        hapticFeedback.warning();
        setBiometricsEnabled(false);
        showToast('Não foi possível ativar a biometria.', 'WARNING');
      }
    } else {
      await biometricsService.disable();
      setBiometricsEnabled(false);
      hapticFeedback.light();
      showToast('Login biométrico desativado.');
    }
  };

  const handleCopy = async (text: string, label: string) => {
    hapticFeedback.success();
    const result = await copyToClipboard(text);
    if (result.copied) {
      showToast(result.method === 'share' ? `${label} pronto para compartilhar!` : `${label} copiado!`);
    } else {
      showToast(`Não foi possível copiar o ${label.toLowerCase()}.`, 'WARNING');
    }
  };

  const handleRunDiagnostics = () => {
    if (testingPing) return; // Evita timers empilhados em toques repetidos.
    hapticFeedback.light();
    setTestingPing(true);
    setPingResult(null);

    setTimeout(() => {
      hapticFeedback.success();
      setTestingPing(false);
      setPingResult({
        latency: '9 ms',
        speed: '508 Mbps',
        status: 'Prévia local — não é uma medição da operadora',
      });
      showToast('Diagnóstico concluído (prévia local; não confirma a rede da operadora).', 'INFO');
    }, 1200);
  };

  const handleOpenWhatsApp = () => {
    hapticFeedback.light();
    const url =
      'https://wa.me/5549988776655?text=Ol%C3%A1!%20Sou%20o%20cliente%20' +
      encodeURIComponent(customer.nome) +
      '%20e%20preciso%20de%20atendimento.';
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    hapticFeedback.selection();
    await setThemeMode(mode);
    const label = mode === 'system' ? 'Automático (Sistema)' : mode === 'dark' ? 'Modo Escuro' : 'Modo Claro';
    showToast(`Tema alterado para ${label}`);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {toastInfo && (
        <Toast
          message={toastInfo.message}
          type={toastInfo.type}
          onDismiss={() => setToastInfo(null)}
        />
      )}

      <ProfileHero customer={customer} colors={colors} />
      <ProfileThemeSection
        colors={colors}
        isDark={isDark}
        themeMode={themeMode}
        onThemeChange={handleThemeChange}
      />
      <ProfileDiagnosticsSection
        colors={colors}
        isNetworkOnline={isNetworkOnline}
        isDemo={customer.isDemo}
        testingPing={testingPing}
        pingResult={pingResult}
        onRunDiagnostics={handleRunDiagnostics}
      />

      {onNavigateToTab && (
        <ProfileQuickAccessSection
          colors={colors}
          onNavigateToTab={onNavigateToTab}
          onOpenTickets={() => setShowTicketsModal(true)}
        />
      )}

      <ProfileAccountSection
        customer={customer}
        colors={colors}
        onCopy={handleCopy}
        onOpenWhatsApp={handleOpenWhatsApp}
        onLogout={onLogout}
      />

      {biometricCap?.hasHardware && (
        <ProfileSecuritySection
          colors={colors}
          biometricCap={biometricCap}
          biometricsEnabled={biometricsEnabled}
          onToggleBiometrics={handleToggleBiometrics}
        />
      )}

      <ProfileToolShortcuts
        colors={colors}
        onOpenSpeedTest={() => setShowSpeedTestModal(true)}
        onOpenWifi={() => setShowWifiModal(true)}
        onOpenOptical={() => setShowOpticalModal(true)}
        onOpenReferral={() => setShowReferralModal(true)}
        onOpenNotifications={() => setShowNotificationsModal(true)}
      />

      <ProfileModalStack
        customer={customer}
        onNavigateToTab={onNavigateToTab}
        showTicketsModal={showTicketsModal}
        showSpeedTestModal={showSpeedTestModal}
        showWifiModal={showWifiModal}
        showOpticalModal={showOpticalModal}
        showNotificationsModal={showNotificationsModal}
        showReferralModal={showReferralModal}
        onShowTicketsModal={setShowTicketsModal}
        onShowSpeedTestModal={setShowSpeedTestModal}
        onShowWifiModal={setShowWifiModal}
        onShowOpticalModal={setShowOpticalModal}
        onShowNotificationsModal={setShowNotificationsModal}
        onShowReferralModal={setShowReferralModal}
        onShowToast={showToast}
      />
    </ScrollView>
  );
};
