import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { RADIUS, SHADOWS } from '../constants/theme';
import { hapticFeedback } from '../utils/haptics';
import { apiService } from '../services/api';
import { PushNotification } from '../types';
import {
  Bell,
  X,
  CreditCard,
  Wrench,
  Truck,
  Gift,
  Info,
  CheckCheck,
  Copy,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react-native';

interface NotificationsModalProps {
  visible: boolean;
  clientId: string;
  isDemo?: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
  onNavigateToTab?: (tab: 'CHAT' | 'INVOICES' | 'PLANS' | 'PROFILE') => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  clientId,
  isDemo = false,
  onClose,
  onShowToast,
  onNavigateToTab,
}) => {
  const { colors } = useAppTheme();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isNetworkOnline = isConnected && isInternetReachable !== false;

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (visible && clientId) {
      loadNotifications();
    }
  }, [visible, clientId]);

  const loadNotifications = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiService.getNotifications(clientId);
      setNotifications(data);
    } catch (e: any) {
      setNotifications([]);
      setLoadError(true);
      onShowToast('Falha ao carregar notificações: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    if (isDemo) {
      onShowToast('Prévia local: notificações não podem ser marcadas como lidas.');
      return;
    }
    try {
      await apiService.markNotificationAsRead(clientId, id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {}
  };

  const handleMarkAllAsRead = async () => {
    if (isDemo) {
      onShowToast('Prévia local: nenhuma alteração de notificações foi enviada.');
      return;
    }
    hapticFeedback.selection();
    try {
      await apiService.markAllNotificationsAsRead(clientId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onShowToast('Todas as notificações marcadas como lidas.');
    } catch (e: any) {
      onShowToast('Erro ao atualizar: ' + e.message);
    }
  };

  const handleCopyPix = (pixCode: string) => {
    if (isDemo) {
      onShowToast('Prévia local: a chave PIX é ilustrativa e não pode ser usada para pagamento.');
      return;
    }
    hapticFeedback.selection();
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(pixCode);
    }
    onShowToast('Chave PIX Copiada em 1 clique! Abra o app do seu banco.');
  };

  const getIconByType = (type: string) => {
    switch (type) {
      case 'INVOICE_REMINDER':
        return <CreditCard size={18} color="#2563EB" />;
      case 'MAINTENANCE_ALERT':
        return <Wrench size={18} color="#D97706" />;
      case 'TICKET_STATUS':
        return <Truck size={18} color="#059669" />;
      case 'REFERRAL_REWARD':
        return <Gift size={18} color="#7C3AED" />;
      default:
        return <Info size={18} color={colors.primary} />;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryUltraLight }]}>
                <Bell size={20} color={colors.primary} strokeWidth={2.5} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.secondary }]}>Central de Notificações</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {isDemo ? 'Prévia local • alertas não confirmados' : 'Alertas Inteligentes & Lembretes'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Ações do Topo */}
          <View style={[styles.topBar, { borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.unreadCount, { color: colors.textMuted }]}>
              {notifications.filter((n) => !n.read).length} não lidas
            </Text>
            <TouchableOpacity style={[styles.markAllBtn, isDemo && { opacity: 0.55 }]} onPress={handleMarkAllAsRead} disabled={isDemo} accessibilityRole="button" accessibilityLabel={isDemo ? 'Marcar tudo (demo) — indisponível' : 'Marcar tudo como lido'}>
              <CheckCheck size={14} color={isDemo ? colors.textMuted : colors.primary} />
              <Text style={[styles.markAllBtnText, { color: isDemo ? colors.textMuted : colors.primary }]}>{isDemo ? 'Marcar tudo (demo)' : 'Marcar tudo como lido'}</Text>
            </TouchableOpacity>
          </View>

          {(isDemo || loadError || !isNetworkOnline) && (
            <View
              style={[styles.statusNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}
              accessibilityLiveRegion="polite"
            >
              <Text style={[styles.statusNoticeText, { color: colors.warningDark }]}>
                {loadError
                  ? isDemo
                    ? 'Ambiente de demonstração: estes alertas são ilustrativos e não confirmam eventos reais.'
                    : 'Não foi possível carregar os alertas do servidor.'
                  : isDemo
                    ? 'Ambiente de demonstração: alertas, ações e status são ilustrativos; nenhuma alteração será salva.'
                    : 'Você está offline. Os alertas serão atualizados ao reconectar.'}
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, { borderColor: colors.warningDark }]}
                onPress={loadNotifications}
                accessibilityRole="button"
                accessibilityLabel="Tentar carregar notificações novamente"
              >
                <Text style={[styles.retryButtonText, { color: colors.warningDark }]}>{isDemo ? 'Recarregar prévia' : 'Tentar novamente'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Bell size={36} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    Nenhuma notificação no momento.
                  </Text>
                </View>
              ) : (
                notifications.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.notifCard,
                      {
                        backgroundColor: item.read ? colors.background : colors.card,
                        borderColor: item.read ? colors.borderLight : colors.primaryBorder,
                      },
                    ]}
                    onPress={isDemo ? undefined : () => handleMarkAsRead(item.id)}
                    disabled={isDemo}
                    activeOpacity={0.85}
                  >
                    <View style={styles.notifHeader}>
                      <View style={styles.notifIcon}>{getIconByType(item.type)}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.notifTitle, { color: colors.text }]}>{isDemo ? `[Prévia] ${item.title}` : item.title}</Text>
                      </View>
                      {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                    </View>

                    <Text style={[styles.notifBody, { color: colors.textMuted }]}>{isDemo ? `Ilustrativo — ${item.body}` : item.body}</Text>

                    {/* Botão de Ação Rápida */}
                    {item.actionType === 'COPY_PIX' && item.actionPayload && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleCopyPix(item.actionPayload!)}
                        disabled={isDemo}
                        accessibilityRole="button"
                        accessibilityLabel={isDemo ? 'PIX indisponível na demo' : 'Copiar chave PIX em 1 clique'}
                      >
                        <Copy size={14} color={isDemo ? colors.textMuted : '#FFFFFF'} />
                        <Text style={[styles.actionBtnText, isDemo && { color: colors.textMuted }]}>{isDemo ? 'PIX indisponível na demo' : 'Copiar Chave PIX em 1 Clique'}</Text>
                      </TouchableOpacity>
                    )}

                    {item.actionType === 'TICKET_DETAILS' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
                        onPress={() => {
                          onClose();
                          onNavigateToTab?.('CHAT');
                        }}
                      >
                        <Text style={styles.actionBtnText}>{isDemo ? 'Ver prévia no Chat' : 'Ver Rastreio no Chat'}</Text>
                        <ArrowRight size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  statusNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  retryButtonText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '90%',
    borderWidth: 1,
    paddingBottom: 24,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  unreadCount: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
  },
  notifCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.sm,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  notifIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifBody: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    marginTop: 10,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
