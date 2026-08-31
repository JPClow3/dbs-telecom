import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { RADIUS, SHADOWS } from '../constants/theme';
import { hapticFeedback } from '../utils/haptics';
import { copyToClipboard } from '../utils/clipboard';
import { apiService } from '../services/api';
import { ReferralSummary } from '../types';
import {
  Gift,
  X,
  Copy,
  Share2,
  UserPlus,
  CheckCircle2,
  Clock,
  Sparkles,
  Percent,
  Users,
  AlertTriangle,
} from 'lucide-react-native';

interface ReferralModalProps {
  visible: boolean;
  clientId: string;
  isDemo?: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'SUCCESS' | 'WARNING' | 'INFO' | 'ERROR') => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  visible,
  clientId,
  isDemo = false,
  onClose,
  onShowToast,
}) => {
  const { colors } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [friendPhone, setFriendPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && clientId) {
      loadSummary();
    }
  }, [visible, clientId]);

  const loadSummary = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const summary = await apiService.getReferralSummary(clientId);
      setData(summary);
    } catch (e: any) {
      setData(null);
      setLoadError(true);
      onShowToast('Erro ao carregar indicações: ' + e.message, 'WARNING');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!data) return;
    if (isDemo) {
      onShowToast('Prévia local: este link é ilustrativo e não pode ser usado para indicação.');
      return;
    }
    hapticFeedback.selection();
    const result = await copyToClipboard(data.referralLink);
    if (result.copied) {
      onShowToast(result.method === 'share' ? 'Link de indicação pronto para compartilhar!' : 'Link de indicação copiado!');
    } else {
      onShowToast('Não foi possível copiar o link. Tente novamente.', 'WARNING');
    }
  };

  const handleShareWhatsApp = () => {
    if (!data) return;
    if (isDemo) {
      onShowToast('Prévia local: compartilhamento de indicação está desativado.');
      return;
    }
    hapticFeedback.medium();
    const text = `Oi! Estou usando a internet DBS Fibra e recomendo muito. Acesse pelo meu link para assinar com 50% de desconto no primeiro mês: ${data.referralLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;

    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  // Guarda de formato: o extrato só é mapeado quando o servidor devolve uma lista.
  const friendsList = data && Array.isArray(data.friends) ? data.friends : [];
  const referralActionsDisabled = isDemo || loadError || !data;

  const handleAddFriend = async () => {
    if (isDemo) {
      onShowToast('Prévia local: nenhuma indicação será cadastrada.');
      return;
    }
    if (!friendName.trim() || friendName.trim().length < 3) {
      onShowToast('Informe o nome completo do amigo.', 'WARNING');
      return;
    }
    const phoneDigits = friendPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      onShowToast('Informe um número de WhatsApp válido com DDD (ex: 49 99999-8888).', 'WARNING');
      return;
    }

    setSubmitting(true);
    hapticFeedback.selection();
    try {
      await apiService.addReferral(clientId, friendName, friendPhone);
      hapticFeedback.success();
      onShowToast('Indicação enviada com sucesso!');
      setFriendName('');
      setFriendPhone('');
      setShowAddForm(false);
      loadSummary();
    } catch (e: any) {
      onShowToast('Erro ao indicar: ' + e.message);
    } finally {
      setSubmitting(false);
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
                <Gift size={20} color={colors.primary} strokeWidth={2.5} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.secondary }]}>Indique e Ganhe 50% OFF</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {isDemo ? 'Prévia local • benefícios não confirmados' : 'Economize na sua fatura indicando amigos'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar indicações"
            >
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {isDemo && (
                <View style={[styles.demoNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}>
                  <AlertTriangle size={16} color={colors.warningDark} />
                  <Text style={[styles.demoNoticeText, { color: colors.warningDark }]}>
                    Ambiente de demonstração: código, link, métricas e descontos são ilustrativos. Compartilhamento e cadastro de indicações estão desativados; nada será enviado.
                  </Text>
                </View>
              )}

              {loadError && !isDemo && (
                <View style={[styles.demoNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}>
                  <AlertTriangle size={16} color={colors.warningDark} />
                  <Text style={[styles.demoNoticeText, { color: colors.warningDark }]}>
                    Não foi possível carregar o extrato de indicações do servidor. Nenhum dado abaixo é real.
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryBtn, { borderColor: colors.warningDark }]}
                    onPress={loadSummary}
                    accessibilityRole="button"
                    accessibilityLabel="Tentar carregar indicações novamente"
                  >
                    <Text style={[styles.retryBtnText, { color: colors.warningDark }]}>Tentar novamente</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Banner de Destaque */}
              <View style={[styles.rewardBanner, { backgroundColor: colors.primary }]}>
                <View style={styles.bannerHeader}>
                  <Sparkles size={20} color="#FFFFFF" />
                  <Text style={styles.bannerTitle}>{isDemo ? 'Prévia de benefício (não confirmado)' : 'Ganhe 50% de Desconto na Próxima Fatura!'}</Text>
                </View>
                <Text style={styles.bannerDesc}>
                  {isDemo
                    ? 'Este texto é apenas uma simulação do programa. Não representa uma oferta ativa nem gera desconto.'
                    : 'Para cada amigo que assinar a DBS Telecom com o seu link, você ganha 50% OFF na sua mensalidade e seu amigo também ganha desconto!'}
                </Text>

                {/* Métricas do Usuário */}
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricVal}>{data?.totalReferred || 0}</Text>
                    <Text style={styles.metricLabel}>{isDemo ? 'Amigos (prévia)' : 'Amigos Indicados'}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricVal}>{data?.activeDiscounts || 0}</Text>
                    <Text style={styles.metricLabel}>{isDemo ? 'Descontos (prévia)' : 'Descontos Ativos'}</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Text style={styles.metricVal}>{data?.totalSavedFormatado || 'R$ 0,00'}</Text>
                    <Text style={styles.metricLabel}>{isDemo ? 'Economia (prévia)' : 'Total Economizado'}</Text>
                  </View>
                </View>
              </View>

              {/* Card de Compartilhamento do Link */}
              <View style={[styles.shareCard, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
                <Text style={[styles.shareLabel, { color: colors.textMuted }]}>{isDemo ? 'LINK ILUSTRATIVO (NÃO UTILIZAR):' : 'SEU CÓDIGO E LINK EXCLUSIVO:'}</Text>
                <View style={[styles.linkBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.linkText, { color: colors.text }]} numberOfLines={1}>
                    {data?.referralLink || 'Link indisponível até a sincronização com o servidor'}
                  </Text>
                </View>

                <View style={styles.shareButtonsRow}>
                  <TouchableOpacity
                    style={[styles.copyBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={handleCopyLink}
                    disabled={referralActionsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={isDemo ? 'Copiar (demo) — indisponível' : referralActionsDisabled ? 'Copiar link — indisponível sem dados confirmados' : 'Copiar link'}
                  >
                    <Copy size={16} color={referralActionsDisabled ? colors.textMuted : colors.text} />
                    <Text style={[styles.copyBtnText, { color: referralActionsDisabled ? colors.textMuted : colors.text }]}>{isDemo ? 'Copiar (demo)' : referralActionsDisabled ? 'Copiar indisponível' : 'Copiar Link'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.whatsappBtn, { backgroundColor: '#25D366' }]}
                    onPress={handleShareWhatsApp}
                    disabled={referralActionsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={isDemo ? 'Compartilhar (demo) — indisponível' : referralActionsDisabled ? 'Compartilhar — indisponível sem dados confirmados' : 'Compartilhar no WhatsApp'}
                  >
                    <Share2 size={16} color={referralActionsDisabled ? colors.textMuted : '#FFFFFF'} />
                    <Text style={[styles.whatsappBtnText, referralActionsDisabled && { color: colors.textMuted }]}>{isDemo ? 'Compartilhar (demo)' : referralActionsDisabled ? 'Compartilhar indisponível' : 'Compartilhar no WhatsApp'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Botão para Indicar Amigo Direto */}
              <TouchableOpacity
                style={[styles.addFriendBtn, { backgroundColor: colors.secondary }]}
                onPress={() => setShowAddForm(!showAddForm)}
                disabled={referralActionsDisabled}
                accessibilityRole="button"
                accessibilityLabel={isDemo ? 'Indicar amigo (demo) — indisponível' : referralActionsDisabled ? 'Indicar amigo — indisponível sem dados confirmados' : showAddForm ? 'Fechar formulário' : 'Indicar amigo por nome ou WhatsApp'}
              >
                <UserPlus size={16} color={isDemo ? colors.textMuted : '#FFFFFF'} />
                <Text style={styles.addFriendBtnText}>
                  {isDemo ? 'Indicar amigo (demo indisponível)' : showAddForm ? 'Fechar Formulário' : '+ Indicar Amigo por Nome/WhatsApp'}
                </Text>
              </TouchableOpacity>

              {showAddForm && (
                <View style={[styles.formCard, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
                  <Text style={[styles.formTitle, { color: colors.secondary }]}>Dados do seu Amigo</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    placeholder="Nome completo do amigo"
                    placeholderTextColor={colors.textMuted}
                    value={friendName}
                     onChangeText={setFriendName}
                     editable={!isDemo}
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                    placeholder="WhatsApp (ex: 49 99999-8888)"
                    placeholderTextColor={colors.textMuted}
                    value={friendPhone}
                     onChangeText={setFriendPhone}
                     editable={!isDemo}
                    keyboardType="phone-pad"
                  />
                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                    onPress={handleAddFriend}
                    disabled={submitting || isDemo}
                    accessibilityRole="button"
                    accessibilityLabel={isDemo ? 'Cadastro indisponível na demo' : submitting ? 'Enviando indicação' : 'Cadastrar indicação'}
                  >
                    <Text style={styles.submitBtnText}>{submitting ? 'Enviando...' : isDemo ? 'Cadastro indisponível na demo' : 'Cadastrar Indicação'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Lista de Amigos Indicados (Extrato) */}
              <View style={styles.friendsSection}>
                <View style={styles.friendsHeader}>
                  <Users size={16} color={colors.primary} />
                  <Text style={[styles.friendsTitle, { color: colors.secondary }]}>{isDemo ? 'Extrato ilustrativo de indicações' : 'Extrato de Amigos Indicados'}</Text>
                </View>

                {friendsList.map((friend) => (
                  <View
                    key={friend.id}
                    style={[
                      styles.friendCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: friend.status === 'ACTIVE_DISCOUNT' ? colors.successBorder : colors.borderLight,
                      },
                    ]}
                  >
                    <View style={styles.friendTop}>
                      <Text style={[styles.friendName, { color: colors.text }]}>{friend.name}</Text>
                      <Text style={[styles.friendPhone, { color: colors.textMuted }]}>{friend.phone}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: friend.status === 'ACTIVE_DISCOUNT' ? colors.successLight : colors.warningLight,
                          borderColor: friend.status === 'ACTIVE_DISCOUNT' ? colors.successBorder : colors.warningBorder,
                        },
                      ]}
                    >
                      {friend.status === 'ACTIVE_DISCOUNT' ? (
                        <CheckCircle2 size={13} color={colors.successDark} strokeWidth={2.5} />
                      ) : (
                        <Clock size={13} color={colors.warningDark} strokeWidth={2.5} />
                      )}
                      <Text
                        style={[
                          styles.statusBadgeText,
                          {
                            color: friend.status === 'ACTIVE_DISCOUNT' ? colors.successDark : colors.warningDark,
                          },
                        ]}
                      >
                        {isDemo ? `Prévia — ${friend.statusLabel}` : friend.statusLabel}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  demoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  demoNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  retryBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  rewardBanner: {
    padding: 16,
    borderRadius: RADIUS.lg,
    marginBottom: 14,
    ...SHADOWS.primary,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bannerDesc: {
    fontSize: 11.5,
    color: '#FFFFFF',
    opacity: 0.9,
    lineHeight: 16,
    marginBottom: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  metricVal: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    opacity: 0.85,
    marginTop: 2,
    textAlign: 'center',
  },
  shareCard: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 12,
  },
  shareLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  linkBox: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  shareButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  whatsappBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    marginBottom: 12,
  },
  addFriendBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  formCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
  },
  submitBtn: {
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  friendsSection: {
    marginTop: 6,
    marginBottom: 20,
  },
  friendsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  friendsTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  friendCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 8,
  },
  friendTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  friendName: {
    fontSize: 13,
    fontWeight: '800',
  },
  friendPhone: {
    fontSize: 11.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
