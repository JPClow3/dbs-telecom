import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Hook opcional para reportar o erro (Sentry, console, telemetria). */
  onError?: (error: Error, componentStack?: string | null) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

/**
 * Barreira de erro global: sem ela qualquer exceção durante a renderização
 * derruba o app para uma tela branca silenciosa. Aqui o usuário vê um
 * diagnóstico honesto e pode tentar recuperar com "Tentar novamente".
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Nunca engolir o erro em silêncio: log local + hook opcional.
    console.error('[ErrorBoundary] Erro de renderização capturado:', error, info.componentStack);
    this.props.onError?.(error, info.componentStack);
  }

  handleReset = () => {
    // Limpa o estado de erro e remonta a árvore filha do zero.
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Algo deu errado</Text>
          <Text style={styles.description}>
            Ocorreu um erro inesperado nesta parte do aplicativo. Seus dados não foram perdidos.
          </Text>
          {this.state.message ? (
            <Text style={styles.errorMessage}>{this.state.message}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReset}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Tentar novamente"
            accessibilityHint="Recarrega esta parte do aplicativo após um erro"
          >
            <Text style={styles.buttonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorMessage: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#94A3B8',
    backgroundColor: '#EEF2F7',
    borderRadius: 8,
    padding: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
});
