import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { DepartmentBadge } from '../components/DepartmentBadge';
import { InvoiceCard } from '../components/InvoiceCard';
import { PlanCard } from '../components/PlanCard';
import { FormattedText } from '../components/FormattedText';
import { TypingIndicator } from '../components/TypingIndicator';
import { Toast, ToastType } from '../components/Toast';
import { CSATCard } from '../components/CSATCard';
import { QueueCard } from '../components/QueueCard';
import { AudioRecorder } from '../components/AudioRecorder';
import { apiService } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hapticFeedback } from '../utils/haptics';
import { copyToClipboard } from '../utils/clipboard';
import * as outbox from '../utils/outbox';
import { ChatMessage, Customer, DepartmentType, DBSPlan } from '../types';
import {
  Send,
  Sparkles,
  CreditCard,
  Wrench,
  ShoppingBag,
  Wifi,
  ShieldCheck,
  CheckCheck,
  Copy,
  Check,
  Mic,
  Volume2,
  Zap,
} from 'lucide-react-native';

const TOP_DEMAND_SHORTCUTS = [
  { id: '1', label: 'Internet Lenta / Queda', text: 'Minha internet está com instabilidade', icon: 'Wrench' },
  { id: '2', label: '2ª Via & PIX', text: 'Quero a 2ª via da minha fatura com PIX', icon: 'CreditCard' },
  { id: '3', label: 'Desbloqueio 72h', text: 'Quero solicitar o desbloqueio em confiança', icon: 'Zap' },
  { id: '4', label: 'Mudar Senha Wi-Fi', text: 'Como faço para trocar a senha do Wi-Fi?', icon: 'Wifi' },
  { id: '5', label: 'Planos & Wi-Fi 6', text: 'Quais são os planos e velocidades disponíveis?', icon: 'ShoppingBag' },
  { id: '6', label: 'Falar com Humano', text: 'Gostaria de falar com um atendente humano', icon: 'Sparkles' },
];

interface ChatScreenProps {
  customer: Customer;
  onNavigateToPlans?: () => void;
  onNavigateToInvoices?: () => void;
  selectedPlanToHire?: DBSPlan | null;
  onClearSelectedPlan?: () => void;
}

type ProviderState = 'unknown' | 'live' | 'local';

function responseProviderState(message?: ChatMessage | null): ProviderState {
  if (!message) return 'unknown';
  const metadata = `${message.aiModel || ''} ${message.aiProvider || ''}`.toLowerCase();
  if (/(offline|local|fallback|heuristic|mock|demo|demonstra)/i.test(metadata)) return 'local';
  if (metadata.trim()) return 'live';
  return 'unknown';
}

function isLocalMessage(message: ChatMessage, forceLocal = false): boolean {
  return forceLocal || responseProviderState(message) === 'local';
}

function displayMessageText(message: ChatMessage, forceLocal = false): string {
  if (!isLocalMessage(message, forceLocal) || message.sender === 'USER') return message.text;
  return `⚠️ **PRÉVIA LOCAL — NÃO CONFIRMADO**\n\n${message.text}`;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  customer,
  onNavigateToPlans,
  onNavigateToInvoices,
  selectedPlanToHire,
  onClearSelectedPlan,
}) => {
  const { colors, isDark } = useAppTheme();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isNetworkOnline = isConnected && isInternetReachable !== false;
  const isDemoEnvironment = Boolean(customer.isDemo);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [currentDepartment, setCurrentDepartment] = useState<DepartmentType>('GERAL');
  const [toastInfo, setToastInfo] = useState<{ message: string; type: ToastType } | null>(null);
  const [copiedProtocol, setCopiedProtocol] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<ProviderState>(
    isDemoEnvironment ? 'local' : 'unknown'
  );

  const flatListRef = useRef<FlatList>(null);
  const sessionId = useRef(`session-${customer.id}-${Date.now()}`).current;

  // Carrega saudação inicial da DBS Telecom
  useEffect(() => {
    async function loadGreeting() {
      setIsTyping(true);
      try {
        const greeting = await apiService.getInitialGreeting(customer.id);
        setMessages([greeting]);
        setProviderState(isDemoEnvironment ? 'local' : responseProviderState(greeting));
        if (greeting.department) setCurrentDepartment(greeting.department);
      } catch (e) {
        console.warn('Erro ao carregar saudação:', e);
        setProviderState(isDemoEnvironment ? 'local' : 'unknown');
      } finally {
        setIsTyping(false);
      }
    }
    loadGreeting();
  }, [customer, isDemoEnvironment]);

  // Se o usuário selecionou um plano na aba Planos, despacha mensagem automaticamente no chat
  useEffect(() => {
    if (selectedPlanToHire) {
      handleSend(`Gostei do plano ${selectedPlanToHire.name} (${selectedPlanToHire.speed}). Como faço para contratar?`);
      if (onClearSelectedPlan) {
        onClearSelectedPlan();
      }
    }
  }, [selectedPlanToHire]);

  const showToast = (message: string, type: ToastType = 'SUCCESS') => {
    setToastInfo({ message, type });
  };

  /**
   * 📤 Reenvio da outbox offline. Reutiliza o mesmo caminho de envio do chat;
   * entrega => remove da fila; falha => conta tentativas, e ao esgotar 3
   * tentativas marca como perdida com um único toast.
   */
  const flushOutboxNow = async (justEnqueuedId?: string) => {
    if (isDemoEnvironment) return;
    try {
      const result = await outbox.flush(async (entry) => {
        const reply = await apiService.sendMessage(entry.text, entry.sessionId, customer.id, entry.id);
        // sendMessage devolve mensagem de sistema em vez de lançar quando a
        // rede cai; trata UNAVAILABLE/UNAUTHORIZED como falha de envio.
        if (reply.dataState === 'UNAVAILABLE' || reply.dataState === 'UNAUTHORIZED') {
          throw new Error('Envio da outbox ainda sem conexão');
        }
        setMessages((prev) => [...prev, reply]);
      }, { maxRetries: 3 });
      if (result.delivered.length > 0 && result.delivered.includes(justEnqueuedId ?? '')) {
        showToast('Mensagem reenviada com sucesso!', 'SUCCESS');
        return;
      }
      if (result.permanentlyFailed.length > 0) {
        showToast(
          result.permanentlyFailed.length === 1
            ? 'Não foi possível reenviar 1 mensagem após 3 tentativas.'
            : `Não foi possível reenviar ${result.permanentlyFailed.length} mensagens após 3 tentativas.`,
          'ERROR'
        );
      }
    } catch (e) {
      console.warn('Erro no flush da outbox:', e);
    }
  };

  // Reconexão / foreground: dispara o flush quando a rede volta.
  const flushOutboxRef = useRef(flushOutboxNow);
  flushOutboxRef.current = flushOutboxNow;
  useEffect(() => {
    if (isNetworkOnline && !isDemoEnvironment) {
      void flushOutboxRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNetworkOnline, isDemoEnvironment]);

  // Enfileira na outbox; usado pelo ramo offline do handleSend.
  const enqueueOutbox = (sessionId: string, text: string) => outbox.enqueue(sessionId, text);

  /**
   * ⚡ Envio de Mensagem com Streaming SSE (efeito digitação tipo ChatGPT)
   */
  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText.trim();
    if (!text) return;

    hapticFeedback.medium();

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: 'USER',
      text,
      timestamp: new Date().toISOString(),
    };

    // Id estável da mensagem: reenvios (fallback síncrono após falha de stream
    // e flush da outbox) carregam o MESMO id, e o servidor deduplica por ele —
    // sem isso um reenvio criava resposta/ticket duplicados.
    const clientMessageId = userMsg.id;

    // ID temporário do bot durante o streaming; mantido após a conclusão para
    // preservar a chave do FlatList e evitar dessincronização da lista.
    const streamingBotId = `bot-stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const initialStreamingBotMsg: ChatMessage = {
      id: streamingBotId,
      sender: 'BOT',
      text: '',
      timestamp: new Date().toISOString(),
      department: currentDepartment,
    };

    setMessages((prev) => [...prev, userMsg, initialStreamingBotMsg]);
    setInputText('');
    setIsTyping(false);

    let accumulatedText = '';

    try {
      await apiService.sendMessageStream(
        text,
        sessionId,
        customer.id,
        (chunk) => {
          accumulatedText += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingBotId ? { ...msg, text: accumulatedText } : msg
            )
          );
          flatListRef.current?.scrollToEnd({ animated: true });
        },
        (finalMessage) => {
          setProviderState(isDemoEnvironment ? 'local' : responseProviderState(finalMessage));
          // Mescla preservando o id local: a chave do FlatList permanece estável
          setMessages((prev) =>
            prev.map((msg) => (msg.id === streamingBotId ? { ...finalMessage, id: streamingBotId } : msg))
          );
          if (finalMessage.department) {
            setCurrentDepartment(finalMessage.department);
          }
          flatListRef.current?.scrollToEnd({ animated: true });
        },
        undefined,
        clientMessageId
      );
    } catch (e) {
      console.warn('Erro no streaming de mensagem:', e);
      // Fallback síncrono: MESMO clientMessageId do stream — o servidor deduplica
      // e não cria segunda resposta/ticket para a mesma mensagem.
      try {
        const fallbackMsg = await apiService.sendMessage(text, sessionId, customer.id, clientMessageId);
        setProviderState(isDemoEnvironment ? 'local' : responseProviderState(fallbackMsg));
        // Mescla preservando o id local do bubble de streaming
        setMessages((prev) =>
          prev.map((msg) => (msg.id === streamingBotId ? { ...fallbackMsg, id: streamingBotId } : msg))
        );
      } catch (fallbackError) {
        setProviderState(isDemoEnvironment ? 'local' : 'unknown');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingBotId
              ? {
                  ...msg,
                  text: 'Sem conexão no momento. Sua mensagem foi salva e será reenviada automaticamente quando a internet voltar.',
                }
              : msg
          )
        );
        // Outbox offline: persiste a mensagem para reenvio automático na
        // reconexão, em vez de perdê-la com um simples toast.
        try {
          const entry = await enqueueOutbox(sessionId, text);
          showToast('Mensagem salva para reenvio', 'INFO');
          void flushOutboxNow(entry.id);
        } catch (outboxError) {
          console.warn('Falha ao salvar mensagem na outbox:', outboxError);
        }
      }
    } finally {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  /**
   * 🎙️ Envio de Mensagem de Áudio / Voz
   */
  const handleSendAudio = async (audioBase64: string, mimeType: string, durationSeconds: number) => {
    setIsRecordingAudio(false);
    setIsTyping(true);
    hapticFeedback.medium();

    const tempAudioId = `user-audio-${Date.now()}`;
    const userAudioPlaceholder: ChatMessage = {
      id: tempAudioId,
      sender: 'USER',
      text: '🎙️ Mensagem de Voz',
      timestamp: new Date().toISOString(),
      cards: {
        type: 'AUDIO',
        audio: {
          durationSeconds,
          transcript: 'Processando áudio com IA...',
        },
      },
    };

    setMessages((prev) => [...prev, userAudioPlaceholder]);

    try {
      const result = await apiService.sendAudioMessage(audioBase64, mimeType, sessionId, customer.id);
      setProviderState(isDemoEnvironment ? 'local' : responseProviderState(result.botMessage));

      // Substitui o placeholder pelo áudio com transcrição real e adiciona a resposta do bot,
      // mesclando preservando o id local do placeholder (chave do FlatList estável)
      setMessages((prev) => [
        ...prev.map((m) => (m.id === tempAudioId ? { ...result.userMessage, id: tempAudioId } : m)),
        result.botMessage,
      ]);

      if (result.botMessage.department) {
        setCurrentDepartment(result.botMessage.department);
      }
      showToast('Áudio processado com sucesso!');
    } catch (e: any) {
      console.warn('Erro no envio de áudio:', e);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempAudioId
            ? {
                ...msg,
                cards: {
                  type: 'AUDIO',
                  audio: {
                    durationSeconds,
                    transcript: 'Não foi possível transcrever o áudio no momento.',
                  },
                },
              }
            : msg
        )
      );
      showToast('Falha ao processar mensagem de voz.', 'WARNING');
    } finally {
      setIsTyping(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    hapticFeedback.success();
    const result = await copyToClipboard(text);
    if (result.copied) {
      showToast(result.method === 'share' ? `${label} pronto para compartilhar!` : `${label} copiado para a área de transferência!`);
    } else {
      showToast(`Não foi possível copiar o ${label.toLowerCase()}.`, 'WARNING');
    }
  };

  const handleCopyProtocol = (protocol: string) => {
    handleCopy(protocol, 'Protocolo de atendimento');
    setCopiedProtocol(protocol);
    setTimeout(() => setCopiedProtocol(null), 2500);
  };

  const handlePlanSelect = (plan: DBSPlan) => {
    hapticFeedback.medium();
    handleSend(`Gostei do plano ${plan.name} (${plan.speed}). Como faço para contratar?`);
  };

  // Helper para ícones dos chips rápidos
  const getChipIcon = (optText: string) => {
    const lower = optText.toLowerCase();
    const iconColor = isDark ? '#FFA07A' : colors.primaryDark;
    if (lower.includes('boleto') || lower.includes('fatura') || lower.includes('pix') || lower.includes('código')) {
      return <CreditCard size={13} color={iconColor} strokeWidth={2.2} />;
    }
    if (lower.includes('lenta') || lower.includes('suporte') || lower.includes('internet') || lower.includes('teste')) {
      return <Wrench size={13} color={iconColor} strokeWidth={2.2} />;
    }
    if (lower.includes('wifi') || lower.includes('wi-fi')) {
      return <Wifi size={13} color={iconColor} strokeWidth={2.2} />;
    }
    if (lower.includes('plano') || lower.includes('contratar') || lower.includes('fechar')) {
      return <ShoppingBag size={13} color={iconColor} strokeWidth={2.2} />;
    }
    return <Sparkles size={13} color={iconColor} strokeWidth={2.2} />;
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'USER';
    const isAudioMsg = item.cards?.type === 'AUDIO';

    return (
      <View style={[styles.messageWrapper, isUser ? styles.userWrapper : styles.botWrapper]}>
        {!isUser && (
          <View
            style={[
              styles.botAvatar,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primaryBorder,
              },
            ]}
          >
            <Sparkles size={14} color={colors.primary} strokeWidth={2.2} />
          </View>
        )}

        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.userBubble, { backgroundColor: colors.primary }]
              : [
                  styles.botBubble,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ],
          ]}
        >
          {!isUser && (
            <Text style={[styles.senderLabel, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
              Davi • DBS Telecom
            </Text>
          )}

          {/* Mensagem de Áudio */}
          {isAudioMsg && (
            <View style={styles.audioBubbleContent}>
              <View style={styles.audioHeaderRow}>
                <Volume2 size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.audioDurationText}>
                  Mensagem de Voz • {item.cards?.audio?.durationSeconds || 4}s
                </Text>
              </View>
              <Text style={styles.audioTranscriptText}>
                "{item.cards?.audio?.transcript || item.text.replace('🎙️', '').trim()}"
              </Text>
            </View>
          )}

          {/* Renderizador Rico de Texto Formatado (se não for áudio puro) */}
          {!isAudioMsg && (
            <FormattedText text={displayMessageText(item, isDemoEnvironment)} isUser={isUser} />
          )}

          {/* Cards de Faturas */}
          {item.cards?.type === 'INVOICE' && item.cards.invoices && (
            <View style={styles.cardContainer}>
              {item.cards.invoices.map((inv) => (
                <InvoiceCard
                  key={inv.id}
                  invoice={inv}
                  isDemo={isLocalMessage(item, isDemoEnvironment)}
                  onCopy={handleCopy}
                  onFeedback={showToast}
                  onUnblockPromise={() => handleSend('Quero solicitar o desbloqueio em confiança')}
                />
              ))}
            </View>
          )}

          {/* Cards de Planos DBS Telecom */}
          {item.cards?.type === 'PLANS' && item.cards.plans && (
            <View style={styles.cardContainer}>
              {item.cards.plans.slice(0, 2).map((plan) => (
                <PlanCard key={plan.id} plan={plan} onSelect={handlePlanSelect} />
              ))}
            </View>
          )}

          {/* Card de Protocolo de Suporte / Chamado IXC */}
          {item.cards?.type === 'TICKET' && item.cards.ticketProtocol && (
            <View
              style={[
                styles.ticketCard,
                {
                  backgroundColor: colors.infoLight,
                  borderColor: colors.infoBorder,
                },
              ]}
            >
              <View style={styles.ticketHeader}>
                <ShieldCheck size={18} color={colors.infoDark} strokeWidth={2.2} />
                <Text style={[styles.ticketTitle, { color: colors.infoDark }]}>
                  {isLocalMessage(item, isDemoEnvironment)
                    ? 'Prévia de chamado (não registrada)'
                    : 'Ordem de Serviço Aberta'}
                </Text>
              </View>
              <View style={styles.protocolRow}>
                <Text style={[styles.protocolLabel, { color: colors.textSecondary }]}>
                  {isDemoEnvironment ? 'Protocolo ilustrativo:' : 'Protocolo Oficial:'}
                </Text>
                <Text style={[styles.protocolCode, { color: colors.primary }]}>
                  {item.cards.ticketProtocol}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.protocolCopyBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.infoBorder,
                    },
                  ]}
                  onPress={() => handleCopyProtocol(item.cards!.ticketProtocol!)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    copiedProtocol === item.cards.ticketProtocol
                      ? 'Protocolo copiado'
                      : 'Copiar protocolo de atendimento'
                  }
                >
                  {copiedProtocol === item.cards.ticketProtocol ? (
                    <Check size={13} color={colors.successDark} strokeWidth={2.5} />
                  ) : (
                    <Copy size={13} color={colors.infoDark} strokeWidth={2.2} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={[styles.ticketDesc, { color: colors.textMuted }]}>
                {isLocalMessage(item, isDemoEnvironment)
                  ? 'Este protocolo é apenas uma demonstração local. Nenhum chamado foi enviado ao IXC.'
                  : 'Seu chamado foi encaminhado para a equipe de suporte avançado com prioridade alta.'}
              </Text>
            </View>
          )}

          {/* ⭐ Card de Pesquisa de Satisfação (CSAT / NPS) */}
          {(item.cards?.type === 'CSAT' || item.cards?.csat) && item.cards?.csat && (
            <CSATCard
              csat={item.cards.csat}
              clientId={customer.id}
              customerName={customer.nome}
              onSubmitted={(r) => showToast(`Obrigado pela sua avaliação de ${r} estrelas! ⭐`)}
            />
          )}

          {/* 👤 Card de Fila Virtual / Transbordo Humano */}
          {(item.cards?.type === 'QUEUE' || item.cards?.queue) && item.cards?.queue && (
            <QueueCard
              queue={item.cards.queue}
              clientId={customer.id}
              isDemo={isLocalMessage(item, isDemoEnvironment)}
              onShowToast={showToast}
              onCancelQueue={() => showToast('Você saiu da fila de atendimento.', 'INFO')}
              onAdvanceQueue={(updated) => {
                if (updated.status === 'ASSIGNED') {
                  showToast('Atendente conectado! Em instantes você será atendido.', 'SUCCESS');
                }
              }}
            />
          )}

          {/* Rodapé da Mensagem com Hora e Status de Entrega */}
          <View style={styles.footerRow}>
            <Text
              style={[
                styles.timeText,
                isUser
                  ? styles.userTimeText
                  : { color: colors.textSubtle },
              ]}
            >
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isUser && (
              <CheckCheck size={13} color="rgba(255,255,255,0.75)" strokeWidth={2} />
            )}
          </View>
        </View>
      </View>
    );
  };

  const lastMessage = messages[messages.length - 1];
  const activeQuickOptions = lastMessage?.quickOptions;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Toast Flutuante de Feedback */}
      {toastInfo && (
        <Toast
          message={toastInfo.message}
          type={toastInfo.type}
          onDismiss={() => setToastInfo(null)}
        />
      )}

      {/* Indicador Discreto de Setor / Canal */}
      <DepartmentBadge department={currentDepartment} />

      <View
        style={[
          styles.providerStatus,
          {
            backgroundColor:
              providerState === 'local' ? colors.warningLight : colors.cardSubdued,
            borderColor: providerState === 'local' ? colors.warningBorder : colors.border,
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        <View
          style={[
            styles.providerDot,
            {
              backgroundColor:
                providerState === 'local'
                  ? colors.warningDark
                  : providerState === 'live'
                  ? colors.success
                  : colors.textSubtle,
            },
          ]}
        />
        <Text
          style={[
            styles.providerText,
            {
              color: providerState === 'local' ? colors.warningDark : colors.textMuted,
            },
          ]}
        >
          {providerState === 'local'
            ? 'Modo demonstração local: pagamentos, contratos e chamados não são confirmados.'
            : providerState === 'live'
            ? 'Atendimento conectado ao servidor.'
            : isNetworkOnline
            ? 'Conectando ao atendimento…'
            : 'Sem internet: sua mensagem não será enviada.'}
        </Text>
      </View>

      {/* 🚀 Barra Superior de Atalhos Rápidos por Demanda */}
      <View style={styles.demandShortcutsContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TOP_DEMAND_SHORTCUTS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.demandShortcutsScroll}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.demandShortcutChip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                hapticFeedback.light();
                handleSend(item.text);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Atalho: ${item.label}`}
            >
              {item.icon === 'Wrench' && <Wrench size={12} color={colors.primary} strokeWidth={2.2} />}
              {item.icon === 'CreditCard' && <CreditCard size={12} color={colors.primary} strokeWidth={2.2} />}
              {item.icon === 'Zap' && <Zap size={12} color={colors.warningDark} strokeWidth={2.5} />}
              {item.icon === 'Wifi' && <Wifi size={12} color={colors.primary} strokeWidth={2.2} />}
              {item.icon === 'ShoppingBag' && <ShoppingBag size={12} color={colors.primary} strokeWidth={2.2} />}
              {item.icon === 'Sparkles' && <Sparkles size={12} color={colors.primary} strokeWidth={2.2} />}
              <Text style={[styles.demandShortcutText, { color: colors.textSecondary }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Lista de Mensagens */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={isTyping ? <TypingIndicator /> : null}
      />

      {/* Sugestões Rápidas em Carrossel */}
      {activeQuickOptions && activeQuickOptions.length > 0 && !isRecordingAudio && (
        <View
          style={[
            styles.quickOptionsContainer,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
            },
          ]}
        >
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={activeQuickOptions}
            keyExtractor={(opt, idx) => `opt-${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.quickChip,
                  {
                    backgroundColor: colors.primaryUltraLight,
                    borderColor: colors.primaryBorder,
                  },
                ]}
                onPress={() => {
                  hapticFeedback.light();
                  handleSend(item);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Sugestão: ${item}`}
              >
                {getChipIcon(item)}
                <Text
                  style={[
                    styles.quickChipText,
                    { color: isDark ? '#FFA07A' : colors.primaryDark },
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.quickOptionsScroll}
          />
        </View>
      )}

      {/* Barra de Entrada / Gravador de Voz */}
      {isRecordingAudio ? (
        <AudioRecorder
          onSendAudio={handleSendAudio}
          onCancel={() => setIsRecordingAudio(false)}
          onError={(msg) => showToast(msg, 'WARNING')}
        />
      ) : (
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
            },
          ]}
        >
          {/* Botão de Gravar Áudio */}
          <TouchableOpacity
            style={[styles.micBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder }]}
            onPress={() => {
              hapticFeedback.medium();
              setIsRecordingAudio(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Gravar mensagem de voz"
            accessibilityHint="Pressione para gravar uma solicitação"
          >
            <Mic size={18} color={colors.primary} strokeWidth={2.5} />
          </TouchableOpacity>

          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Digite sua dúvida ou solicitação..."
            placeholderTextColor={colors.textSubtle}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            accessibilityLabel="Mensagem para o atendimento"
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: colors.primary },
              !inputText.trim() && { backgroundColor: colors.borderDark, shadowOpacity: 0, elevation: 0 },
            ]}
            onPress={() => handleSend()}
            disabled={!inputText.trim()}
            activeOpacity={0.85}
            testID="send-message-btn"
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
          >
            <Send size={16} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  providerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 16,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
  },
  providerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  providerText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },
  demandShortcutsContainer: {
    marginTop: 6,
    marginBottom: 2,
  },
  demandShortcutsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  demandShortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  demandShortcutText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexGrow: 1,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginVertical: 5,
    alignItems: 'flex-end',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  botWrapper: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...SHADOWS.sm,
  },
  userBubble: {
    borderBottomRightRadius: RADIUS.xs,
  },
  botBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: RADIUS.xs,
  },
  senderLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  audioBubbleContent: {
    paddingVertical: 2,
  },
  audioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  audioDurationText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  audioTranscriptText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    fontStyle: 'italic',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  userTimeText: {
    color: 'rgba(255,255,255,0.8)',
  },
  cardContainer: {
    marginTop: 8,
    width: '100%',
  },
  ticketCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 8,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  protocolLabel: {
    fontSize: 12,
  },
  protocolCode: {
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  protocolCopyBtn: {
    padding: 4,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
  },
  ticketDesc: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  quickOptionsContainer: {
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  quickOptionsScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.primary,
  },
});
