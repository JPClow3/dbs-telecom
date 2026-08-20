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
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onSendAudio,
  onCancel,
}) => {
  const { colors } = useAppTheme();
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);

  const nativeRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const nativeRecordingStartedRef = useRef(false);

  // Web MediaRecorder refs
  const mediaRecorderRef = useRef<any>(null);
  const mediaStreamRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animação de pulso contínuo durante a gravação
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
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
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
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
          }
        }
      } else {
        // Plataforma Nativa (Android & iOS)
        try {
          const perm = await AudioModule.requestRecordingPermissionsAsync();
          if (!perm.granted) {
            console.warn('[AudioRecorder] Permissão de microfone negada no dispositivo.');
            return;
          }

          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });

          if (isCancelled) return;

          await nativeRecorder.prepareToRecordAsync();
          nativeRecorder.record();
          nativeRecordingStartedRef.current = true;
        } catch (err) {
          console.warn('[AudioRecorder] Erro ao iniciar gravação nativa expo-audio:', err);
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
      try {
        await nativeRecorder.stop();
        const uri = nativeRecorder.uri;
        nativeRecordingStartedRef.current = false;

        if (uri) {
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const mimeType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
          onSendAudio(base64Data, mimeType, audioDuration);
          return;
        }
      } catch (e) {
        console.warn('[AudioRecorder] Erro ao processar arquivo de áudio nativo:', e);
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
      } catch (e) {
        console.warn('[AudioRecorder] Erro ao finalizar gravação web:', e);
      }
    }

    console.warn('[AudioRecorder] Nenhuma gravação de áudio válida foi produzida.');
    onCancel();
  };

  const handleCancelRecording = async () => {
    hapticFeedback.light();
    setIsRecording(false);
    if (nativeRecordingStartedRef.current) {
      try {
        await nativeRecorder.stop();
      } catch {}
      nativeRecordingStartedRef.current = false;
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
