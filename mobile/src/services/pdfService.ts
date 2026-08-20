import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { FormattedInvoice } from '../types';

/**
 * Constrói string e Base64 de um documento PDF 1.4 estruturado e padronizado para boletos DBS Telecom
 */
export function generateBoletoPdfBase64(
  invoice: Partial<FormattedInvoice> & { id: string },
  clientName = 'Emanuel da Silva',
  clientDoc = '154.293.707-89',
  clientAddress = 'Av. Brasil, 1500 - Centro, Chapecó - SC'
): { base64: string; binaryString: string } {
  const cleanStr = (s: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\\()]/g, '');

  const safeClient = cleanStr(clientName);
  const safeAddress = cleanStr(clientAddress);
  const safeDoc = cleanStr(invoice.documento || invoice.id);
  const safeLinha = cleanStr(invoice.linhaDigitavelFormatada || invoice.linhaDigitavel || '04790.00002 00000.145698 03047.711654 2 60000011990');
  const safeValor = cleanStr(invoice.valorFormatado || `R$ ${(invoice.valor || 119.9).toFixed(2).replace('.', ',')}`);
  const safeVenc = cleanStr(invoice.dataVencimentoFormatada || '10/09/2026');
  const safeEmissao = cleanStr(invoice.dataEmissao || '10/08/2026');

  let contentStream = `
q
% Cabeçalho e bordas
0.92 0.94 0.98 rg
40 760 515 50 re f
0.0 0.4 0.8 RG
2 w
40 760 515 50 re S

% Título Topo
BT
/F2 16 Tf
0.0 0.3 0.7 rg
55 780 Td
(DBS TELECOMUNICACOES - FIBRA OTICA) Tj
ET

BT
/F1 10 Tf
0.3 0.3 0.3 rg
420 780 Td
(SAC: 0800 000 0000) Tj
ET

% Informações do Cedente
BT
/F2 11 Tf
0.1 0.1 0.1 rg
40 735 Td
(BENEFICIARIO: DBS TELECOMUNICACOES LTDA | CNPJ: 12.345.678/0001-90) Tj
ET

BT
/F1 9 Tf
0.4 0.4 0.4 rg
40 720 Td
(Agencia/Codigo Beneficiario: 0477 / 14569-8  |  Especie: R$  |  Aceite: N) Tj
ET

% Tabela do Boleto
0.8 0.8 0.8 RG
1 w
40 590 515 115 re S
40 675 515 0.5 re S
40 645 515 0.5 re S
40 615 515 0.5 re S
380 590 0.5 115 re S

% Campos da Fatura
BT
/F1 8 Tf
0.5 0.5 0.5 rg
45 692 Td (Nosso Numero) Tj
200 692 Td (Numero do Documento) Tj
385 692 Td (Vencimento) Tj
45 662 Td (Data de Emissao) Tj
200 662 Td (Especie Documento) Tj
385 662 Td (Valor do Documento) Tj
45 632 Td (Uso do Banco) Tj
200 632 Td (Carteira) Tj
385 632 Td (Valor Cobrado) Tj
ET

BT
/F2 11 Tf
0.1 0.1 0.1 rg
45 680 Td (${safeDoc}) Tj
200 680 Td (${safeDoc}) Tj
385 680 Td (${safeVenc}) Tj
45 650 Td (${safeEmissao}) Tj
200 650 Td (DM) Tj
385 650 Td (${safeValor}) Tj
45 620 Td (047-7) Tj
200 620 Td (175 - Rapida) Tj
385 620 Td (${safeValor}) Tj
ET

% Dados do Pagador
0.96 0.96 0.96 rg
40 500 515 80 re f
0.8 0.8 0.8 RG
40 500 515 80 re S

BT
/F2 10 Tf
0.2 0.2 0.2 rg
50 565 Td (PAGADOR / SACADO:) Tj
ET

BT
/F1 9 Tf
0.2 0.2 0.2 rg
50 548 Td (Nome: ${safeClient}  -  CPF/CNPJ: ${cleanStr(clientDoc)}) Tj
50 533 Td (Endereco: ${safeAddress}) Tj
50 518 Td (Mensalidade DBS Fibra Otica - Acesso Residencial de Alta Velocidade) Tj
ET

% Instruções de Pagamento
0.94 0.97 1.0 rg
40 400 515 90 re f
0.7 0.85 1.0 RG
40 400 515 90 re S

BT
/F2 10 Tf
0.0 0.35 0.75 rg
50 472 Td (INSTRUCOES DE PAGAMENTO:) Tj
ET

BT
/F1 8.5 Tf
0.2 0.2 0.2 rg
50 455 Td (- PAGAVEL EM QUALQUER BANCO OU VIA PIX ATE O VENCIMENTO.) Tj
50 440 Td (- APOS O VENCIMENTO COBRAR JUROS DE 1% AO MES E MULTA DE 2,00%.) Tj
50 425 Td (- PAGUE VIA PIX UTILIZANDO O APLICATIVO DO SEU BANCO PARA COMPENSACAO IMEDIATA.) Tj
50 410 Td (- EVITE A SUSPENSAO DO SINAL PAGANDO EM DIA OU SOLICITANDO O DESBLOQUEIO EM CONFIANCA.) Tj
ET

% Linha Digitável
BT
/F2 12 Tf
0.0 0.2 0.5 rg
40 370 Td (${safeLinha}) Tj
ET

% Código de Barras (Gráfico vetorial de barras)
0.1 0.1 0.1 rg
`;

  // Desenha barras de código de barras vetoriais
  let xPos = 45;
  const barHeights = 50;
  const yPos = 300;
  const pattern = [2, 1, 3, 1, 1, 4, 2, 1, 3, 2, 1, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 1, 2, 1, 4, 2, 3, 1, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 1, 2, 4, 2, 1, 3, 1, 2, 3, 1, 4, 1, 2, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 1, 2, 4, 2, 1];

  for (let i = 0; i < pattern.length; i++) {
    const barWidth = pattern[i];
    if (i % 2 === 0) {
      contentStream += `${xPos} ${yPos} ${barWidth} ${barHeights} re f\n`;
    }
    xPos += barWidth + 1.2;
  }

  contentStream += `
% Autenticação Mecânica
BT
/F1 8 Tf
0.5 0.5 0.5 rg
40 275 Td (Autenticacao Mecanica / Ficha de Compensacao - DBS Telecom Tecnologia Ltda) Tj
ET
Q
`;

  // Montagem dos objetos do arquivo PDF
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj'
  );
  objects.push(
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj`
  );
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');

  let pdf = '%PDF-1.4\n';
  const xrefOffsets = [0];

  for (let i = 0; i < objects.length; i++) {
    xrefOffsets.push(pdf.length);
    pdf += objects[i] + '\n';
  }

  const startXref = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i++) {
    const offset = String(xrefOffsets[i]).padStart(10, '0');
    pdf += `${offset} 00000 n \n`;
  }

  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${startXref}\n`;
  pdf += '%%EOF\n';

  // Base64 encoding
  let base64 = '';
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(pdf, 'utf-8').toString('base64');
  } else if (typeof btoa !== 'undefined') {
    base64 = btoa(unescape(encodeURIComponent(pdf)));
  }

  return { base64, binaryString: pdf };
}

export const pdfService = {
  /**
   * Baixa, gera e abre ou compartilha o PDF do boleto bancário no dispositivo nativo (APK) ou Web
   */
  async downloadAndOpenInvoicePdf(
    invoice: Partial<FormattedInvoice> & { id: string },
    apiUrl: string,
    authToken?: string | null,
    customerData?: { name?: string; doc?: string; address?: string }
  ): Promise<{ success: boolean; message: string; uri?: string }> {
    const filename = `Boleto-DBS-Fatura-${invoice.id}.pdf`;
    const downloadUrl = `${apiUrl}/financial/invoices/${invoice.id}/pdf?clientId=${(invoice as any).clienteId || '2270'}&download=true`;

    // --- 1. AMBIENTE WEB ---
    if (Platform.OS === 'web') {
      try {
        if (typeof document !== 'undefined') {
          // Tenta download via API
          const headers: Record<string, string> = {};
          if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
          }
          const res = await fetch(downloadUrl, { headers });
          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
            return { success: true, message: 'Download do PDF iniciado com sucesso!' };
          }
        }
      } catch (err) {
        console.warn('[PdfService] Falha no fetch web, gerando PDF local:', err);
      }

      // Fallback Web: Geração local e download direto
      try {
        if (typeof document !== 'undefined') {
          const { binaryString } = generateBoletoPdfBase64(
            invoice,
            customerData?.name,
            customerData?.doc,
            customerData?.address
          );
          const blob = new Blob([binaryString], { type: 'application/pdf' });
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
          return { success: true, message: 'PDF do boleto gerado e baixado com sucesso!' };
        }
      } catch (e: any) {
        console.warn('[PdfService] Erro ao gerar blob web:', e);
      }

      // Fallback final: Abrir em nova aba
      if (typeof window !== 'undefined') {
        const popup = window.open(downloadUrl, '_blank');
        if (popup) {
          return { success: true, message: 'Boleto aberto em uma nova aba.' };
        }
      }
      return {
        success: false,
        message: 'Não foi possível gerar, baixar ou abrir o boleto. Tente novamente.',
      };
    }

    // --- 2. AMBIENTE NATIVO (ANDROID APK & IOS) ---
    const targetDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const fileUri = `${targetDir}${filename}`;

    let isDownloaded = false;

    // Tentativa 1: Baixar diretamente do Backend
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri, { headers });
      if (downloadResult.status === 200) {
        isDownloaded = true;
      }
    } catch (netErr) {
      console.warn('[PdfService] Erro ao baixar PDF da rede, gerando offline:', netErr);
    }

    // Tentativa 2: Geração local caso o backend esteja offline
    if (!isDownloaded) {
      try {
        const { base64 } = generateBoletoPdfBase64(
          invoice,
          customerData?.name,
          customerData?.doc,
          customerData?.address
        );
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        isDownloaded = true;
      } catch (genErr) {
        console.warn('[PdfService] Erro ao gravar PDF localmente:', genErr);
      }
    }

    if (!isDownloaded) {
      // Fallback final nativo: Tenta abrir o link no navegador
      try {
        await Linking.openURL(downloadUrl);
        return { success: true, message: 'Boleto aberto no navegador.', uri: downloadUrl };
      } catch (openErr) {
        console.warn('[PdfService] Não foi possível abrir o boleto no navegador:', openErr);
        return {
          success: false,
          message: 'Não foi possível baixar ou abrir o boleto. Tente novamente.',
        };
      }
    }

    // Abertura nativa no Android via Intent / Visualizador de PDF padrão
    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/pdf',
        });
        return { success: true, message: 'Boleto PDF aberto com sucesso!', uri: fileUri };
      } catch (intentErr) {
        console.warn('[PdfService] IntentLauncher falhou, tentando Sharing:', intentErr);
      }
    }

    // Compartilhamento nativo (Share Sheet / Salvar nos Arquivos / Enviar para WhatsApp/Email)
    try {
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Boleto DBS Telecom - Fatura #${invoice.id}`,
          UTI: 'com.adobe.pdf',
        });
        return { success: true, message: 'Boleto pronto para visualização e compartilhamento!', uri: fileUri };
      }
    } catch (shareErr) {
      console.warn('[PdfService] Erro no shareAsync:', shareErr);
    }

    return {
      success: true,
      message: 'Boleto salvo no dispositivo, mas nenhum visualizador compatível foi encontrado.',
      uri: fileUri,
    };
  },
};
