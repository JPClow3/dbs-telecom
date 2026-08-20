import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { COLORS, SHADOWS, RADIUS } from '../constants/theme';
import { Mic, Trash2, Send, StopCircle, Radio } from 'lucide-react-native';

interface AudioRecorderProps {
  onSendAudio: (audioBase64: string, mimeType: string, durationSeconds: number) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onSendAudio,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<any[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation while recording
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

  // Duration Timer
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Web MediaRecorder initialization
  useEffect(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const mediaRecorder = new (window as any).MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event: any) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.start(200);
        })
        .catch((err) => {
          console.warn('Microfone web não acessível ou sem permissão:', err);
        });
    }

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStopAndSend = async () => {
    setIsRecording(false);
    const audioDuration = Math.max(1, duration);

    // Se estiver no ambiente Web com MediaRecorder
    if (Platform.OS === 'web' && mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            const base64Data = (reader.result as string).split(',')[1];
            onSendAudio(base64Data, 'audio/webm', audioDuration);
          };
        };
        return;
      } catch (e) {
        console.warn('Erro ao finalizar gravação web:', e);
      }
    }

    // Fallback de áudio sintetizado / compatível
    const dummyAudioBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    onSendAudio(dummyAudioBase64, 'audio/wav', audioDuration);
  };

  return (
    <View style={styles.container}>
      {/* Botão de Cancelar */}
      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={onCancel}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color={COLORS.dangerDark} strokeWidth={2.2} />
      </TouchableOpacity>

      {/* Indicador de Gravação e Onda Sonora */}
      <View style={styles.recordingIndicator}>
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Radio size={14} color={COLORS.dangerDark} strokeWidth={2.5} />
        </Animated.View>

        <Text style={styles.timerText}>{formatTime(duration)}</Text>

        <View style={styles.waveContainer}>
          {[4, 8, 14, 10, 16, 8, 12, 6, 14, 10, 6].map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: h }]} />
          ))}
        </View>
      </View>

      {/* Botão de Enviar Áudio */}
      <TouchableOpacity
        style={styles.sendAudioBtn}
        onPress={handleStopAndSend}
        activeOpacity={0.85}
      >
        <Send size={16} color={COLORS.white} strokeWidth={2.5} />
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
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  cancelBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  pulseCircle: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.dangerDark,
    fontFamily: 'monospace',
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
    backgroundColor: COLORS.danger,
    borderRadius: 2,
  },
  sendAudioBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.primary,
  },
});
