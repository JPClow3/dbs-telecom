import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { Customer } from '../types';
import { LogOut, Bell } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface HeaderProps {
  customer?: Customer | null;
  onLogout?: () => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  customer,
  onLogout,
  onOpenNotifications,
  unreadCount = 2,
}) => {
  const { colors, isDark } = useAppTheme();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isAppOnline = isConnected && isInternetReachable !== false;
  const isDemoSession = Boolean(customer?.isDemo);
  const statusColor = isDemoSession ? colors.warning : isAppOnline ? colors.success : colors.danger;
  const statusLabel = isDemoSession ? 'Ambiente demo' : isAppOnline ? 'App online' : 'Sem internet';

  const handleLogoutPress = () => {
    hapticFeedback.light();
    if (onLogout) onLogout();
  };

  const handleNotificationsPress = () => {
    hapticFeedback.light();
    if (onOpenNotifications) onOpenNotifications();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {/* Lado Esquerdo: Identidade da Marca & Status da Conexão */}
      <View style={styles.leftSection}>
        <View
          style={[
            styles.logoWrapper,
            {
              backgroundColor: isDark ? colors.cardSubdued : colors.white,
              borderColor: colors.border,
            },
          ]}
        >
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.brandTextWrapper}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.secondary }]}>DBS</Text>
            <Text style={[styles.titleAccent, { color: colors.primary }]}>TELECOM</Text>
          </View>
          <View style={styles.statusPill} accessibilityLiveRegion="polite">
            <View
              style={[
                styles.pulseDot,
                { backgroundColor: statusColor },
              ]}
            />
            <Text style={[styles.statusText, { color: colors.textMuted }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Lado Direito: Notificações & Perfil do Cliente */}
      {customer && (
        <View style={styles.rightSection}>
          {onOpenNotifications && (
            <TouchableOpacity
              style={[
                styles.iconBtn,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleNotificationsPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Notificações"
              accessibilityHint="Abrir alertas e lembretes da conta"
            >
              <Bell size={16} color={colors.text} />
              {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <View
            style={[
              styles.userCard,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{customer.nome.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                {customer.nome.split(' ')[0]}
              </Text>
              <Text style={[styles.userSubtitle, { color: colors.textMuted }]}>
                #{customer.id}
              </Text>
            </View>
          </View>

          {onLogout && (
            <TouchableOpacity
              style={[
                styles.logoutBtn,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleLogoutPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Trocar de conta"
              accessibilityHint="Sair desta conta e voltar para o login"
            >
              <LogOut size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    ...SHADOWS.sm,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoWrapper: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  logo: {
    width: 28,
    height: 28,
  },
  brandTextWrapper: {
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  titleAccent: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginLeft: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 7,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  userInfo: {
    maxWidth: 86,
  },
  userName: {
    fontSize: 12,
    fontWeight: '700',
  },
  userSubtitle: {
    fontSize: 9,
    fontWeight: '500',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
});
