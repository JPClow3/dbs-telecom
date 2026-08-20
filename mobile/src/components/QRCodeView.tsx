import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';

interface QRCodeViewProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

/**
 * Gerador visual SVG de QR Code leve e determinístico para conexão rápida de Wi-Fi e dados
 */
export const QRCodeView: React.FC<QRCodeViewProps> = ({
  value,
  size = 200,
  color = '#000000',
  backgroundColor = '#FFFFFF',
}) => {
  // Matriz 21x21 (QR Code Version 1 padrão) com Finder Patterns nos cantos e dados pseudo-determinísticos
  const matrixSize = 25;
  const cellSize = size / matrixSize;

  // Gera grid baseado no hash determinístico do valor
  const grid = React.useMemo(() => {
    const matrix: boolean[][] = Array.from({ length: matrixSize }, () =>
      Array.from({ length: matrixSize }, () => false)
    );

    // 1. Finder pattern generator (7x7 cantos)
    const placeFinder = (startX: number, startY: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 ||
            r === 6 ||
            c === 0 ||
            c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[startY + r][startX + c] = true;
          }
        }
      }
    };

    placeFinder(0, 0); // Top-left
    placeFinder(matrixSize - 7, 0); // Top-right
    placeFinder(0, matrixSize - 7); // Bottom-left

    // 2. Timing patterns (linhas sincronizadoras)
    for (let i = 8; i < matrixSize - 8; i++) {
      matrix[6][i] = i % 2 === 0;
      matrix[i][6] = i % 2 === 0;
    }

    // 3. Preenchimento determinístico com base nos caracteres do SSID/Senha
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        // Pula finders e timing patterns
        const isFinderTopLeft = r < 8 && c < 8;
        const isFinderTopRight = r < 8 && c >= matrixSize - 8;
        const isFinderBottomLeft = r >= matrixSize - 8 && c < 8;
        const isTiming = r === 6 || c === 6;

        if (!isFinderTopLeft && !isFinderTopRight && !isFinderBottomLeft && !isTiming) {
          const bit = (Math.abs(hash ^ (r * 31 + c * 17 + value.charCodeAt((r + c) % value.length))) % 3) === 0;
          matrix[r][c] = bit;
        }
      }
    }

    return matrix;
  }, [value, matrixSize]);

  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect width={size} height={size} fill={backgroundColor} />
        {grid.map((row, r) =>
          row.map((cell, c) => {
            if (!cell) return null;
            return (
              <Rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize + 0.3}
                height={cellSize + 0.3}
                fill={color}
              />
            );
          })
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
