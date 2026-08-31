import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SHADOWS, RADIUS } from '../constants/theme';
import { CSATCardData } from '../types';
import { apiService } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { Star, CheckCircle, Sparkles, Send } from 'lucide-react-native';

interface CSATCardProps {
  csat: CSATCardData;
  clientId: string;
  customerName?: string;
  onSubmitted?: (rating: number) => void;
}

export const CSATCard: React.FC<CSATCardProps> = ({
  csat,
  clientId,
  customerName,
  onSubmitted,
}) => {
  const { colors, isDark } = useAppTheme();
  const [rating, setRating] = useState<number>(csat.selectedRating || 5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(csat.submitted || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const getTagsByContext = () => {
    if (csat.context === 'DIAGNOSTIC') {
      return [
        '⚡ Rápido e Prático',
        '🛠️ Conexão Normalizou',
        '💡 Muito Claro',
        '⭐ Excelente Atendimento',
      ];
    }
    if (csat.context === 'HIRING') {
      return [
        '🚀 Excelente Plano',
        '📶 Wi-Fi 6',
        '💰 Ótimo Custo-Benefício',
        '⚡ Instalação Ágil',
      ];
    }
    return [
      '👍 Resolveu Minha Dúvida',
      '⚡ Resposta Imediata',
      '⭐ 5 Estrelas',
      '👏 Muito Fácil',
    ];
  };

  const availableTags = getTagsByContext();

  const toggleTag = (tag: string) => {
    hapticFeedback.light();
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || isSubmitted) return;
    hapticFeedback.medium();
    setIsSubmitting(true);
    setSubmitError(false);

    try {
      await apiService.submitCSAT({
        clientId,
        clientName: customerName,
        rating,
        comment,
        tags: selectedTags,
        context: csat.context,
        targetProtocol: csat.targetProtocol,
      });

      setIsSubmitted(true);
      if (onSubmitted) {
        onSubmitted(rating);
      }
    } catch (e) {
      // Falha real do servidor: manter o formulário e permitir nova tentativa.
      // Trocar por "obrigado" esconderia a perda do feedback do cliente.
      console.warn('Erro ao enviar CSAT:', e);
      hapticFeedback.warning();
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <View
        style={[
          styles.submittedCard,
          {
            backgroundColor: colors.successLight,
            borderColor: colors.successBorder,
          },
        ]}
      >
        <CheckCircle size={22} color={colors.successDark} strokeWidth={2.5} />
        <View style={styles.submittedContent}>
          <Text style={[styles.submittedTitle, { color: colors.successDark }]}>
            Obrigado pela sua avaliação!
          </Text>
          <Text style={[styles.submittedSubtitle, { color: colors.textMuted }]}>
            Sua opinião nos ajuda a melhorar a cada dia o atendimento da DBS Telecom.
          </Text>
          <View style={styles.submittedStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={14}
                color={star <= rating ? '#F59E0B' : '#E2E8F0'}
                fill={star <= rating ? '#F59E0B' : 'none'}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.card,
          borderColor: colors.primaryBorder,
        },
      ]}
    >
      {/* Header com Ícone e Título */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIconBox, { backgroundColor: colors.primaryLight }]}>
          <Sparkles size={16} color={colors.primary} strokeWidth={2.5} />
        </View>
        <Text style={[styles.headerTitle, { color: isDark ? '#FFA07A' : colors.primaryDark }]}>
          Pesquisa de Satisfação
        </Text>
      </View>

      <Text style={[styles.questionText, { color: colors.textSecondary }]}>{csat.question}</Text>

      {/* 5 Estrelas Interativas */}
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            style={[
              styles.starBtn,
              {
                backgroundColor: colors.cardSubdued,
                borderColor: colors.border,
              },
              star <= rating && [
                styles.starBtnActive,
                {
                  backgroundColor: isDark ? '#3D2F15' : '#FFFBEB',
                  borderColor: '#FDE68A',
                },
              ],
            ]}
            onPress={() => {
              hapticFeedback.selection();
              setRating(star);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
            accessibilityState={{ selected: star <= rating }}
          >
            <Star
              size={26}
              color={star <= rating ? '#F59E0B' : colors.textMuted}
              fill={star <= rating ? '#F59E0B' : 'none'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.ratingHint, { color: colors.textSecondary }]}>
        {rating === 5 && '🌟 Excelente! Ficamos muito felizes.'}
        {rating === 4 && '👍 Muito bom! Obrigado pela avaliação.'}
        {rating === 3 && '🙂 Bom, mas queremos melhorar.'}
        {rating <= 2 && '😔 Sentimos muito. Vamos aprimorar.'}
      </Text>

      {/* Tags de Feedback Rápido */}
      <View style={styles.tagsContainer}>
        {availableTags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <TouchableOpacity
              key={tag}
              style={[
                styles.tagChip,
                {
                  backgroundColor: colors.cardSubdued,
                  borderColor: colors.border,
                },
                isSelected && [
                  styles.tagChipSelected,
                  {
                    backgroundColor: colors.primaryLight,
                    borderColor: colors.primaryBorder,
                  },
                ],
              ]}
              onPress={() => toggleTag(tag)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: colors.textSecondary },
                  isSelected && {
                    color: isDark ? '#FFA07A' : colors.primaryDark,
                    fontWeight: '800',
                  },
                ]}
              >
                {tag}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Campo Opcional de Comentário */}
      <TextInput
        style={[
          styles.commentInput,
          {
            backgroundColor: colors.cardSubdued,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
        placeholder="Deixe um comentário ou elogio (opcional)..."
        placeholderTextColor={colors.textSubtle}
        value={comment}
        onChangeText={setComment}
        multiline
      />

      {/* Aviso de falha com nova tentativa */}
      {submitError && (
        <Text style={[styles.errorText, { color: colors.dangerDark }]}>
          Não foi possível registrar sua avaliação agora. Verifique a conexão e toque em "Confirmar Avaliação" novamente.
        </Text>
      )}

      {/* Botão de Enviar */}
      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={isSubmitting ? 'Enviando avaliação' : 'Confirmar avaliação'}
      >
        <Send size={14} color="#FFFFFF" strokeWidth={2.5} />
        <Text style={styles.submitBtnText}>
          {isSubmitting ? 'Enviando avaliação...' : 'Confirmar Avaliação'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 10,
    ...SHADOWS.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  headerIconBox: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  questionText: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 17,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
  },
  starBtn: {
    padding: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  starBtnActive: {},
  ratingHint: {
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    marginVertical: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  tagChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  tagChipSelected: {},
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    minHeight: 44,
    marginTop: 4,
    marginBottom: 10,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    ...SHADOWS.primary,
  },
  submitBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 8,
  },
  submittedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 8,
  },
  submittedContent: {
    flex: 1,
  },
  submittedTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  submittedSubtitle: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  submittedStarsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 5,
  },
});
