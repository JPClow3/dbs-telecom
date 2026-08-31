import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { SHADOWS, RADIUS } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { hapticFeedback } from '../utils/haptics';
import { Trash2, Send, Radio } from 'lucide-react-native';

interface AudioRecorderProps {
  onSendAudio: (audioBase64: string, mimeType: string, durationSeconds: number) => void;
  onCancel: () => void;
  onError?: (errorMessage: string) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onSendAudio,
  onCancel,
  onError,
}) => {
  const { colors } = useAppTheme();
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);

  const nativeRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const nativeRecordingStartedRef = useRef(false);
  // Guarda a URI assim que a gravação é preparada: garante que o arquivo possa
  // ser removido mesmo se stop() falhar ou o componente desmontar no meio.
  const lastNativeUriRef = useRef<string | null>(null);

  // Web MediaRecorder refs
  const mediaRecorderRef = useRef<any>(null);
  const mediaStreamRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animação de pulso contínuo durante a gravação
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isRecording) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      // Interrompe o loop ao parar a gravação ou desmontar; sem isso a
      // animação continua rodando para sempre em segundo plano.
      loop?.stop();
    };
  }, [isRecording]);

  // Cronômetro da gravação
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Inicialização da Gravação Nativa (expo-audio) ou Web (MediaRecorder)
  useEffect(() => {
    let isCancelled = false;

    const startRecording = async () => {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (isCancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            mediaStreamRef.current = stream;
            const mediaRecorder = new (window as any).MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event: any) => {
              if (event.data && event.data.size > 0) {
                audioChunksRef.current.push(event.data);
              }
            };

            mediaRecorder.start(200);
          } catch (err) {
            console.warn('[AudioRecorder] Microfone web indisponível ou sem permissão:', err);
            onError?.('Microfone indisponível ou permissão negada no navegador.');
            onCancel();
          }
        } else {
          onError?.('Gravação de áudio não suportada neste ambiente.');
          onCancel();
        }
      } else {
        // Plataforma Nativa (Android & iOS)
        try {
          const perm = await AudioModule.requestRecordingPermissionsAsync();
          if (!perm.granted) {
            console.warn('[AudioRecorder] Permissão de microfone negada no dispositivo.');
            onError?.('Permissão de microfone necessária para gravar áudio. Ative o acesso nas configurações do aparelho.');
            onCancel();
            return;
          }

          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });

          if (isCancelled) return;

          await nativeRecorder.prepareToRecordAsync();
          lastNativeUriRef.current = nativeRecorder.uri ?? null;
          nativeRecorder.record();
          nativeRecordingStartedRef.current = true;
        } catch (err: any) {
          console.warn('[AudioRecorder] Erro ao iniciar gravação nativa expo-audio:', err);
          onError?.('Falha ao acessar o microfone do aparelho.');
          onCancel();
        }
      }
    };

    startRecording();

    return () => {
      isCancelled = true;
      if (nativeRecordingStartedRef.current) {
        nativeRecorder.stop().catch(() => {});
        nativeRecordingStartedRef.current = false;
      }
      // Limpeza de desmontagem: remove qualquer arquivo temporário gravado,
      // mesmo quando stop() falha — evita .m4a/.mp4 órfãos no dispositivo.
      const orphanUri = lastNativeUriRef.current;
      lastNativeUriRef.current = null;
      if (orphanUri) {
        FileSystem.deleteAsync(orphanUri, { idempotent: true }).catch(() => {});
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((t: any) => t.stop());
        } catch {}
      }
    };
  }, [nativeRecorder]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStopAndSend = async () => {
    hapticFeedback.medium();
    setIsRecording(false);
    const audioDuration = Math.max(1, duration);

    // 1. Gravação Nativa (Android / iOS)
    if (nativeRecordingStartedRef.current) {
      let uri: string | null = null;
      try {
        await nativeRecorder.stop();
        uri = nativeRecorder.uri ?? null;
      } catch (e: any) {
        console.warn('[AudioRecorder] stop() falhou; usando URI conhecida para limpeza:', e);
        // Mesmo com stop() falhando, o arquivo pode existir no disco:
        // usa a URI capturada no prepare() para não deixar órfãos.
        uri = lastNativeUriRef.current;
      }
      nativeRecordingStartedRef.current = false;
      lastNativeUriRef.current = null;

      if (uri) {
        try {
          // Utiliza 'base64' string literal diretamente para evitar TypeError em runtime Android Hermes
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64' as any,
          });

          const mimeType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
          onSendAudio(base64Data, mimeType, audioDuration);
        } catch (e: any) {
          console.warn('[AudioRecorder] Erro ao processar arquivo de áudio nativo:', e);
          onError?.('Erro ao processar arquivo de áudio gravado.');
        } finally {
          // Remove o arquivo temporário do disco mesmo se o envio falhar,
          // evitando acúmulo de arquivos .m4a/.mp4 órfãos no dispositivo.
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
        return;
      }
    }

    // 2. Gravação Web (MediaRecorder)
    if (Platform.OS === 'web' && mediaRecorderRef.current) {
      try {
        const stream = mediaStreamRef.current;
        const currentRecorder = mediaRecorderRef.current;
        const recordedMimeType = currentRecorder.mimeType || 'audio/webm';

        currentRecorder.onstop = async () => {
          if (stream) {
            stream.getTracks().forEach((t: any) => t.stop());
          }
          const blob = new Blob(audioChunksRef.current, { type: recordedMimeType });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            const resultStr = reader.result as string;
            const base64Data = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
            onSendAudio(base64Data, recordedMimeType, audioDuration);
          };
        };

        if (currentRecorder.state !== 'inactive') {
          currentRecorder.stop();
        }
        return;
      } catch (e: any) {
        console.warn('[AudioRecorder] Erro ao finalizar gravação web:', e);
        onError?.('Erro ao finalizar gravação de áudio web.');
      }
    }

    console.warn('[AudioRecorder] Nenhuma gravação de áudio válida foi produzida.');
    onCancel();
  };

  const handleCancelRecording = async () => {
    hapticFeedback.light();
    setIsRecording(false);
    if (nativeRecordingStartedRef.current) {
      // Captura a URI ANTES do stop: se stop() lançar, o arquivo ainda pode
      // existir no disco e precisa ser apagado do mesmo jeito.
      const uri = lastNativeUriRef.current ?? nativeRecorder.uri ?? null;
      try {
        await nativeRecorder.stop();
      } catch {}
      nativeRecordingStartedRef.current = false;
      lastNativeUriRef.current = null;
      if (uri) {
        // Cancelar descarta a gravação: apaga o arquivo para não deixar órfãos.
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } else if (lastNativeUriRef.current) {
      // Gravação já interrompida mas arquivo ainda em disco.
      const orphanUri = lastNativeUriRef.current;
      lastNativeUriRef.current = null;
      await FileSystem.deleteAsync(orphanUri, { idempotent: true }).catch(() => {});
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t: any) => t.stop());
      } catch {}
    }
    onCancel();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      {/* Botão de Cancelar */}
      <TouchableOpacity
        style={[styles.cancelBtn, { backgroundColor: colors.dangerLight, borderColor: colors.dangerBorder }]}
        onPress={handleCancelRecording}
        activeOpacity={0.7}
        testID="cancel-audio-btn"
        accessibilityRole="button"
        accessibilityLabel="Descartar gravação"
        accessibilityHint="Cancela e apaga o áudio gravado"
      >
        <Trash2 size={18} color={colors.dangerDark} strokeWidth={2.2} />
      </TouchableOpacity>

      {/* Indicador de Gravação e Onda Sonora */}
      <View
        style={[
          styles.recordingIndicator,
          { backgroundColor: colors.dangerLight, borderColor: colors.dangerBorder },
        ]}
      >
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Radio size={14} color={colors.dangerDark} strokeWidth={2.5} />
        </Animated.View>

        <Text style={[styles.timerText, { color: colors.dangerDark }]}>{formatTime(duration)}</Text>

        <View style={styles.waveContainer}>
          {[4, 8, 14, 10, 16, 8, 12, 6, 14, 10, 6].map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: h, backgroundColor: colors.danger }]} />
          ))}
        </View>
      </View>

      {/* Botão de Enviar Áudio */}
      <TouchableOpacity
        style={[styles.sendAudioBtn, { backgroundColor: colors.primary }]}
        onPress={handleStopAndSend}
        activeOpacity={0.85}
        testID="send-audio-btn"
        accessibilityRole="button"
        accessibilityLabel="Enviar mensagem de voz"
        accessibilityHint="Finaliza a gravação e envia o áudio"
      >
        <Send size={16} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  cancelBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  pulseCircle: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  waveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    paddingRight: 6,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  sendAudioBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.primary,
  },
});
