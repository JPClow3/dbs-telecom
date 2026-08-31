import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

interface FormattedTextProps {
  text: string;
  style?: TextStyle;
  isUser?: boolean;
}

/**
 * Renderizador inteligente de formatação Markdown leve para React Native
 * Transforma **negrito**, `código/protocolo`, listas e parágrafos em elementos nativos estéticos.
 */
export const FormattedText: React.FC<FormattedTextProps> = ({ text, style, isUser = false }) => {
  const { colors, isDark } = useAppTheme();
  if (!text) return null;

  // Divide o texto por quebras de linha para manter a estrutura harmônica de parágrafos
  const paragraphs = text.split('\n');

  const botTextColor = colors.text;
  const botBoldColor = isDark ? '#FFFFFF' : colors.secondary;
  const botCodeColor = isDark ? '#FFA07A' : colors.primaryDark;

  return (
    <Text
      style={[
        styles.baseText,
        isUser ? styles.userBaseText : { color: botTextColor },
        style,
      ]}
    >
      {paragraphs.map((paragraph, pIdx) => {
        const isLastParagraph = pIdx === paragraphs.length - 1;
        const tokens = parseInlineMarkdown(paragraph);

        return (
          <React.Fragment key={`p-${pIdx}`}>
            {tokens.map((token, tIdx) => {
              if (token.type === 'bold') {
                return (
                  <Text
                    key={`t-${tIdx}`}
                    style={[
                      styles.boldText,
                      isUser ? styles.userBoldText : { color: botBoldColor },
                    ]}
                  >
                    {token.content}
                  </Text>
                );
              }
              if (token.type === 'code') {
                return (
                  <Text
                    key={`t-${tIdx}`}
                    style={[
                      styles.codeText,
                      isUser ? styles.userCodeText : { color: botCodeColor },
                    ]}
                  >
                    {token.content}
                  </Text>
                );
              }
              return (
                <Text key={`t-${tIdx}`}>
                  {token.content}
                </Text>
              );
            })}
            {!isLastParagraph && '\n'}
          </React.Fragment>
        );
      })}
    </Text>
  );
};

interface Token {
  type: 'text' | 'bold' | 'code';
  content: string;
}

function parseInlineMarkdown(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: line.substring(lastIndex, match.index),
      });
    }

    const fullMatch = match[0];
    if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      tokens.push({
        type: 'bold',
        content: fullMatch.slice(2, -2),
      });
    } else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      tokens.push({
        type: 'code',
        content: fullMatch.slice(1, -1),
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'text',
      content: line.substring(lastIndex),
    });
  }

  if (tokens.length === 0) {
    tokens.push({ type: 'text', content: line });
  }

  return tokens;
}

const styles = StyleSheet.create({
  baseText: {
    fontSize: 14.5,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  userBaseText: {
    color: '#FFFFFF',
    fontWeight: '400',
  },
  boldText: {
    fontWeight: '700',
  },
  userBoldText: {
    color: '#FFFFFF',
  },
  codeText: {
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
  },
  userCodeText: {
    color: '#FED7AA',
  },
});
