import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { COLORS, SHADOWS, RADIUS } from '../constants/theme';
import { CSATCardData } from '../types';
import { apiService } from '../services/api';
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
  const [rating, setRating] = useState<number>(csat.selectedRating || 5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(csat.submitted || false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || isSubmitted) return;
    setIsSubmitting(true);

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
      console.warn('Erro ao enviar CSAT:', e);
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <View style={styles.submittedCard}>
        <CheckCircle size={22} color={COLORS.successDark} strokeWidth={2.5} />
        <View style={styles.submittedContent}>
          <Text style={styles.submittedTitle}>Obrigado pela sua avaliação!</Text>
          <Text style={styles.submittedSubtitle}>
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
    <View style={styles.cardContainer}>
      {/* Header com Ícone e Título */}
      <View style={styles.headerRow}>
        <View style={styles.headerIconBox}>
          <Sparkles size={16} color={COLORS.primary} strokeWidth={2.5} />
        </View>
        <Text style={styles.headerTitle}>Pesquisa de Satisfação</Text>
      </View>

      <Text style={styles.questionText}>{csat.question}</Text>

      {/* 5 Estrelas Interativas */}
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            style={[styles.starBtn, star <= rating && styles.starBtnActive]}
            onPress={() => setRating(star)}
            activeOpacity={0.7}
          >
            <Star
              size={26}
              color={star <= rating ? '#F59E0B' : '#CBD5E1'}
              fill={star <= rating ? '#F59E0B' : '#F8FAFC'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.ratingHint}>
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
              style={[styles.tagChip, isSelected && styles.tagChipSelected]}
              onPress={() => toggleTag(tag)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>{tag}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Campo Opcional de Comentário */}
      <TextInput
        style={styles.commentInput}
        placeholder="Deixe um comentário ou elogio (opcional)..."
        placeholderTextColor={COLORS.textSubtle}
        value={comment}
        onChangeText={setComment}
        multiline
      />

      {/* Botão de Enviar */}
      <TouchableOpacity
        style={styles.submitBtn}
        onPress={handleSubmit}
        disabled={isSubmitting}
        activeOpacity={0.85}
      >
        <Send size={14} color={COLORS.white} strokeWidth={2.5} />
        <Text style={styles.submitBtnText}>
          {isSubmitting ? 'Enviando avaliação...' : 'Confirmar Avaliação'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
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
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
    letterSpacing: 0.2,
  },
  questionText: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  starBtnActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  ratingHint: {
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginVertical: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  tagChip: {
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  tagChipSelected: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryBorder,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tagTextSelected: {
    color: COLORS.primaryDark,
    fontWeight: '800',
  },
  commentInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    color: COLORS.text,
    minHeight: 44,
    marginTop: 4,
    marginBottom: 10,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    ...SHADOWS.primary,
  },
  submitBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.white,
  },
  submittedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
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
    color: COLORS.successDark,
  },
  submittedSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  submittedStarsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 5,
  },
});
