import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { FormattedInvoice } from '../types';
import { apiService } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import {
  Receipt,
  Calendar,
  Copy,
  QrCode,
  Check,
  AlertCircle,
  CheckCircle2,
  FileText,
} from 'lucide-react-native';

interface InvoiceCardProps {
  invoice: FormattedInvoice;
  /** Local/demo cards must never look like payment confirmation. */
  isDemo?: boolean;
  onCopy?: (text: string, label: string) => void;
  onFeedback?: (message: string, type: 'SUCCESS' | 'WARNING') => void;
  onUnblockPromise?: (invoice: FormattedInvoice) => void;
}

export const InvoiceCard: React.FC<InvoiceCardProps> = ({
  invoice,
  isDemo = false,
  onCopy,
  onFeedback,
  onUnblockPromise,
}) => {
  const { colors, isDark } = useAppTheme();
  const [copiedType, setCopiedType] = useState<'BARCODE' | 'PIX' | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleCopy = (text: string, type: 'BARCODE' | 'PIX') => {
    if (isDemo) {
      onFeedback?.('Prévia local: código não disponível para pagamento.', 'WARNING');
      return;
    }
    hapticFeedback.success();
    if (onCopy) {
      onCopy(text, type === 'BARCODE' ? 'Código de Barras' : 'Chave PIX');
    }
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleDownloadPdf = async () => {
    if (isDemo) {
      onFeedback?.('Prévia local: boleto PDF não disponível.', 'WARNING');
      return;
    }
    hapticFeedback.medium();
    setDownloadingPdf(true);
    try {
      const res = await apiService.downloadInvoicePdf(invoice.id, undefined, invoice);
      onFeedback?.(
        res.message || (res.success ? 'Boleto PDF pronto!' : 'Não foi possível abrir o boleto.'),
        res.success ? 'SUCCESS' : 'WARNING'
      );
    } catch (e) {
      console.warn('Erro ao baixar PDF:', e);
      onFeedback?.('Erro ao processar boleto em PDF.', 'WARNING');
    } finally {
      setTimeout(() => setDownloadingPdf(false), 1200);
    }
  };

  const isPaid = invoice.status === 'PAGO';
  const isOverdue = invoice.isOverdue || invoice.status === 'VENCIDO';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        isOverdue && { borderColor: colors.dangerBorder },
        isPaid && { borderColor: colors.successBorder },
      ]}
    >
      {/* Header do Card com Título e Status */}
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.titleGroup}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: isPaid ? colors.successLight : colors.primaryLight },
            ]}
          >
            <Receipt
              size={16}
              color={isPaid ? colors.successDark : colors.primary}
              strokeWidth={2.2}
            />
          </View>
          <View>
            <Text style={[styles.docTitle, { color: colors.secondary }]}>Mensalidade DBS Fibra</Text>
            <Text style={[styles.docNumber, { color: colors.textMuted }]}>
              Documento #{invoice.documento || invoice.id}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusPill,
            isPaid
              ? { backgroundColor: colors.successLight, borderColor: colors.successBorder }
              : isOverdue
              ? { backgroundColor: colors.dangerLight, borderColor: colors.dangerBorder }
              : { backgroundColor: colors.warningLight, borderColor: colors.warningBorder },
          ]}
        >
          {isPaid ? (
            <CheckCircle2 size={11} color={colors.successDark} strokeWidth={2.5} />
          ) : (
            <AlertCircle
              size={11}
              color={isOverdue ? colors.dangerDark : colors.warningDark}
              strokeWidth={2.5}
            />
          )}
          <Text
            style={[
              styles.statusText,
              {
                color: isPaid
                  ? colors.successDark
                  : isOverdue
                  ? colors.dangerDark
                  : colors.warningDark,
              },
            ]}
          >
            {isPaid ? 'Pago' : isOverdue ? 'Vencido' : 'Em Aberto'}
          </Text>
        </View>
      </View>

      {/* Valores e Data de Vencimento */}
      <View style={styles.metaRow}>
        <View style={styles.valueContainer}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>VALOR TOTAL</Text>
          <Text
            style={[
              styles.valueAmount,
              { color: isPaid ? colors.secondary : colors.primary },
            ]}
          >
            {invoice.valorFormatado}
          </Text>
          {invoice.obs && (
            <Text style={[styles.obsText, { color: colors.textMuted }]}>{invoice.obs}</Text>
          )}
        </View>

        <View style={styles.dueContainer}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>VENCIMENTO</Text>
          <View style={styles.dueRow}>
            <Calendar
              size={13}
              color={isOverdue ? colors.dangerDark : colors.textSecondary}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.dueText,
                { color: isOverdue ? colors.dangerDark : colors.text },
              ]}
            >
              {invoice.dataVencimentoFormatada}
            </Text>
          </View>
        </View>
      </View>

      {isDemo && (
        <View
          style={[styles.demoNotice, { backgroundColor: colors.warningLight, borderColor: colors.warningBorder }]}
          accessibilityLiveRegion="polite"
        >
          <AlertCircle size={14} color={colors.warningDark} strokeWidth={2.3} />
          <Text style={[styles.demoNoticeText, { color: colors.warningDark }]}>Prévia local: confirme a fatura no servidor antes de pagar.</Text>
        </View>
      )}

      {/* Se não estiver pago, exibe a Linha Digitável e Ações */}
      {!isPaid ? (
        <>
          {/* Seção de Código de Barras */}
          <View
            style={[
              styles.barcodeBox,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.barcodeHeader}>
              <View style={styles.barcodeVisual}>
                {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2].map((w, i) => (
                  <View
                    key={i}
                    style={[styles.barcodeBar, { width: w, backgroundColor: colors.textMuted }]}
                  />
                ))}
              </View>
              <Text style={[styles.barcodeLabel, { color: colors.textMuted }]}>LINHA DIGITÁVEL</Text>
            </View>
            <Text
              style={[
                styles.barcodeText,
                { color: isDark ? '#E2E8F0' : colors.secondary },
              ]}
              selectable
              numberOfLines={2}
            >
              {invoice.linhaDigitavelFormatada || invoice.linhaDigitavel}
            </Text>
          </View>

          {/* Botões de Ação Principais */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
                copiedType === 'BARCODE' && {
                  backgroundColor: colors.success,
                  borderColor: colors.successDark,
                },
                isDemo && { opacity: 0.55 },
              ]}
              onPress={() => handleCopy(invoice.linhaDigitavel, 'BARCODE')}
              disabled={isDemo}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={isDemo ? 'Código indisponível na prévia local' : 'Copiar código de barras'}
            >
              {copiedType === 'BARCODE' ? (
                <>
                  <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.actionBtnTextWhite}>Código Copiado!</Text>
                </>
              ) : (
                <>
                  <Copy size={14} color={colors.textSecondary} strokeWidth={2.2} />
                  <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>
                    Copiar Código
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.pixBtn,
                { backgroundColor: colors.primary, borderColor: colors.primaryDark },
                copiedType === 'PIX' && {
                  backgroundColor: colors.success,
                  borderColor: colors.successDark,
                },
                isDemo && { opacity: 0.55 },
              ]}
              onPress={() => handleCopy(invoice.pixCopiaECola, 'PIX')}
              disabled={isDemo}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={isDemo ? 'PIX indisponível na prévia local' : 'Pagar com PIX'}
            >
              {copiedType === 'PIX' ? (
                <>
                  <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.actionBtnTextWhite}>PIX Copiado!</Text>
                </>
              ) : (
                <>
                  <QrCode size={14} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={styles.actionBtnTextWhite}>Pagar com PIX</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Botão de Download do PDF Oficial do Boleto */}
          <TouchableOpacity
            style={[
              styles.pdfBtn,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primaryBorder,
              },
              isDemo && { opacity: 0.55 },
            ]}
            onPress={handleDownloadPdf}
            disabled={downloadingPdf || isDemo}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isDemo ? 'Boleto PDF indisponível na prévia local' : 'Visualizar ou baixar boleto em PDF'}
          >
            <FileText size={14} color={isDark ? '#FFA07A' : colors.primaryDark} strokeWidth={2.2} />
            <Text style={[styles.pdfBtnText, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
              {downloadingPdf ? 'Gerando Boleto PDF...' : 'Visualizar / Baixar Boleto em PDF'}
            </Text>
          </TouchableOpacity>

          {/* Alerta de Desbloqueio em Confiança quando Vencido */}
          {isOverdue && onUnblockPromise && !isDemo && (
            <TouchableOpacity
              style={[
                styles.unblockBanner,
                {
                  backgroundColor: colors.warningLight,
                  borderColor: colors.warningBorder,
                },
              ]}
              onPress={() => {
                hapticFeedback.medium();
                onUnblockPromise(invoice);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.unblockIconBox, { backgroundColor: isDark ? '#3D2F15' : '#FEF3C7' }]}>
                <AlertCircle size={14} color={colors.warningDark} strokeWidth={2.5} />
              </View>
              <View style={styles.unblockContent}>
                <Text style={[styles.unblockTitle, { color: colors.warningDark }]}>
                  Sinal bloqueado ou reduzido?
                </Text>
                <Text style={[styles.unblockDesc, { color: colors.textSecondary }]}>
                  Toque para liberar a internet por 72h em confiança
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View
          style={[
            styles.paidNotice,
            {
              backgroundColor: colors.successLight,
              borderColor: colors.successBorder,
            },
          ]}
        >
          <CheckCircle2 size={14} color={colors.successDark} strokeWidth={2.2} />
          <Text style={[styles.paidNoticeText, { color: colors.successDark }]}>
            Fatura liquidada com sucesso no sistema da DBS Telecom.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    ...SHADOWS.md,
  },
  demoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: 9,
    marginBottom: 10,
  },
  demoNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  docNumber: {
    fontSize: 11,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  valueContainer: {
    flex: 1,
  },
  dueContainer: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  valueAmount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  obsText: {
    fontSize: 10.5,
    marginTop: 2,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dueText: {
    fontSize: 13,
    fontWeight: '700',
  },
  barcodeBox: {
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: 12,
  },
  barcodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  barcodeVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
    height: 12,
  },
  barcodeBar: {
    height: '100%',
    borderRadius: 0.5,
  },
  barcodeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  barcodeText: {
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnTextWhite: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pixBtn: {},
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    marginTop: 8,
    borderWidth: 1,
  },
  pdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  unblockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: RADIUS.sm,
    marginTop: 8,
    borderWidth: 1,
  },
  unblockIconBox: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockContent: {
    flex: 1,
  },
  unblockTitle: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  unblockDesc: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  paidNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  paidNoticeText: {
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
});
