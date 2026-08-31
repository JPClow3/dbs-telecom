import React from 'react';
import { View } from 'react-native';
import QRCodeSvg from 'react-native-qrcode-svg';

interface QRCodeViewProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

/**
 * QR Code real (codificação UTF-8 com correção de erro) renderizado em SVG.
 * O conteúdo informado em `value` é o que o leitor decodifica — por exemplo
 * `WIFI:T:WPA;S:<ssid>;P:<senha>;;` para conexão automática de visitas.
 */
export const QRCodeView: React.FC<QRCodeViewProps> = ({
  value,
  size = 200,
  color = '#000000',
  backgroundColor = '#FFFFFF',
}) => {
  if (!value) {
    return null;
  }

  return (
    <View accessible accessibilityLabel="QR Code" accessibilityHint={value}>
      <QRCodeSvg
        value={value}
        size={size}
        color={color}
        backgroundColor={backgroundColor}
      />
    </View>
  );
};
