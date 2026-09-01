import { EventEmitter } from 'events';
import crypto from 'node:crypto';
import { ixcService } from '../ixc/ixc.service.js';
import { ixcCache } from '../ixc/ixc.cache.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { getDatabase } from '../../database/db.js';
import { CONFIG } from '../../config/env.js';

/** Janela de replay-protection em memória (camada rápida sobre a persistida). */
const PIX_EVENT_TTL_MS = 10 * 60 * 1000;

export interface FormattedInvoice {
  id: string;
  documento: string;
  valor: number;
  valorFormatado: string;
  dataEmissao: string;
  dataVencimento: string;
  dataVencimentoFormatada: string;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO';
  linhaDigitavel: string;
  linhaDigitavelFormatada: string;
  pixCopiaECola: string;
  obs?: string;
  isOverdue: boolean;
  simulated?: boolean;
}

export interface PixWebhookPayload {
  event?: string;
  invoiceId: string;
  clientId: string;
  txid?: string;
  endToEndId?: string;
  amount?: number;
  paidAt?: string;
}

/** Resultado da reconciliação com o ERP (IXC) após a liquidação do PIX. */
export interface PixReconciliationResult {
  attempted: boolean;
  /** Fatura marcada como paga (status R) no fn_areceber do IXC. */
  invoiceMarkedPaid?: boolean;
  /** Chamado de conciliação criado no IXC (auditoria). */
  ticketCreated?: boolean;
  protocol?: string;
  errors: string[];
}

/** Registro de pagamento PIX persistido localmente. */
export interface PixPaymentRecord {
  id: string;
  invoiceId: string;
  clientId: string;
  amount: number;
  paidAt: string;
}

/** Linha bruta da tabela pix_payments (snake_case, como sai do banco). */
export interface PixPaymentRow {
  // Índice aberto exigido pela assinatura genérica IStatement.get<T extends Record<string, unknown>>.
  [key: string]: unknown;
  id: number;
  invoice_id: string;
  client_id: string;
  txid: string | null;
  end_to_end_id: string | null;
  amount: string;
  paid_at: string;
  webhook_event_id: string;
  created_at: string;
}

export class FinancialService {
  // ATENÇÃO: EventEmitter é processo-local. Em deployments multi-instância
  // (Workers/containers), o webhook pode chegar numa instância e o cliente SSE
  // estar conectado em outra — o evento nunca chega. O stream PIX compensa com
  // keepalive + notificação persistida; para tempo real real entre instâncias,
  // usar Postgres LISTEN/NOTIFY ou Durable Objects (o stream da fila já faz
  // polling de 5s como mitigação).
  public pixEvents = new EventEmitter();
  private readonly processedPixEvents = new Map<string, number>();

  constructor() {
    // Cada cliente com boleto aberto mantém uma conexão SSE de confirmação
    // de PIX; o limite padrão de 10 listeners estouraria em produção.
    this.pixEvents.setMaxListeners(500);
  }

  /**
   * Busca e formata faturas do cliente no IXC
   */
  async getInvoicesByClientId(clientId: string): Promise<FormattedInvoice[]> {
    const rawInvoices = await ixcService.getClientInvoices(clientId);

    // The gateway can settle a payment before the IXC write is available.
    // Local durable payment rows therefore override the ERP status and can
    // also supply a minimal paid invoice when the ERP temporarily omits it.
    const localPayments = await getDatabase().prepare(`
      SELECT invoice_id, amount, paid_at, webhook_event_id, created_at
      FROM pix_payments WHERE client_id = ? ORDER BY paid_at DESC
    `).all<PixPaymentRow>(clientId);
    const paymentByInvoice = new Map<string, PixPaymentRow>();
    for (const payment of localPayments) {
      if (!paymentByInvoice.has(payment.invoice_id)) paymentByInvoice.set(payment.invoice_id, payment);
    }

    const invoices = [...rawInvoices];
    const knownInvoiceIds = new Set(invoices.map((invoice) => invoice.id));
    for (const payment of localPayments) {
      if (knownInvoiceIds.has(payment.invoice_id)) continue;
      const paidDate = payment.paid_at.slice(0, 10);
      invoices.push({
        id: payment.invoice_id,
        id_cliente: clientId,
        status: 'R',
        data_emissao: paidDate,
        data_vencimento: paidDate,
        valor: payment.amount,
        valor_aberto: '0',
        valor_recebido: payment.amount,
        documento: payment.invoice_id,
      });
    }

    const formatted: FormattedInvoice[] = [];
    for (const inv of invoices) {
      const localPayment = paymentByInvoice.get(inv.id);
      const isPaid = Boolean(localPayment) || inv.status === 'R';
      const valorNum = parseFloat(inv.valor || inv.valor_aberto || '');
      if (!Number.isFinite(valorNum) || valorNum < 0) {
        // Uma linha corrompida do ERP não pode derrubar o extrato inteiro:
        // a fatura inválida é ignorada e as válidas seguem disponíveis.
        console.warn(`[FinancialService] Fatura ${inv.id || 'sem id'} ignorada por valor inválido.`);
        continue;
      }

      // Validação de vencimento precisa com base no final do dia de vencimento (23:59:59)
      const parts = (inv.data_vencimento || '').split('-').map(Number);
      let isOverdue = false;
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const dueEndOfDay = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
        isOverdue = dueEndOfDay.getTime() < Date.now() && !isPaid;
      }

      // A linha/Pix só pode ser exibida quando fornecida pelo ERP. The demo
      // adapter is the only place where a visibly simulated payload is made.
      const rawLinha = inv.linha_digitavel || '';
      const linhaFormatada = this.formatLinhaDigitavel(rawLinha);
      const pixPayload = inv.pix_copia_e_cola || (CONFIG.demoMode ? this.generatePixPayload(inv.id, valorNum) : '');

      formatted.push({
        id: inv.id,
        documento: inv.documento || inv.id,
        valor: valorNum,
        valorFormatado: valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        dataEmissao: inv.data_emissao,
        dataVencimento: inv.data_vencimento,
        dataVencimentoFormatada: this.formatDate(inv.data_vencimento),
        status: isPaid ? 'PAGO' : isOverdue ? 'VENCIDO' : 'PENDENTE',
        linhaDigitavel: rawLinha,
        linhaDigitavelFormatada: linhaFormatada,
        pixCopiaECola: pixPayload,
        obs: inv.obs,
        isOverdue,
        simulated: CONFIG.demoMode,
      });
    }

    return formatted;
  }

  /**
   * Executa o Desbloqueio em Confiança (Promessa de Pagamento) por 72h
   */
  async unblockPromise(clientId: string, contractId?: string) {
    return await ixcService.unblockPromise(clientId, contractId);
  }

  /**
   * Gera o PDF oficial do boleto bancário da DBS Telecom
   */
  async getInvoicePdf(invoiceId: string, clientId: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const invoices = await this.getInvoicesByClientId(clientId);
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) {
      const error = new Error('Boleto não encontrado para o cliente autenticado.');
      (error as Error & { code?: string }).code = 'INVOICE_NOT_FOUND';
      throw error;
    }

    const client = await ixcService.findClientById(clientId);
    if (!client && !CONFIG.demoMode) {
      const error = new Error('Dados do cliente indisponíveis no ERP; boleto não pode ser emitido.');
      (error as Error & { code?: string }).code = 'IXC_UNAVAILABLE';
      throw error;
    }
    const clientName = client?.razao || 'Cliente de demonstração';
    const clientDoc = client?.cnpj_cpf || 'DADOS-DEMO';
    const clientAddress = `${client?.endereco || 'Endereço de demonstração'}, ${client?.numero || '0'} - ${client?.bairro || 'Demonstração'}, ${client?.cidade || 'Demonstração'} - SC`;

    const pdfBuffer = this.buildBoletoPdfBuffer(invoice, clientName, clientDoc, clientAddress);
    return {
      filename: `Boleto-DBS-Fatura-${invoice.id}.pdf`,
      buffer: pdfBuffer,
      contentType: 'application/pdf',
    };
  }

  /**
   * Constrói documento PDF 1.4 estruturado e estilizado com os dados do boleto bancário
   */
  private buildBoletoPdfBuffer(
    invoice: FormattedInvoice,
    clientName: string,
    clientDoc: string,
    clientAddress: string
  ): Buffer {
    // Sanitiza strings para o charset PDF WinAnsi/ASCII
    const cleanStr = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\()]/g, '');

    const safeClient = cleanStr(clientName);
    const safeAddress = cleanStr(clientAddress);
    const safeDoc = cleanStr(invoice.documento || invoice.id);
    const safeLinha = invoice.linhaDigitavelFormatada || invoice.linhaDigitavel;
    const safeValor = cleanStr(invoice.valorFormatado);
    const safeVenc = cleanStr(invoice.dataVencimentoFormatada);

    // Comandos de desenho gráfico e texto em PostScript/PDF
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
45 650 Td (${cleanStr(invoice.dataEmissao || '2026-08-10')}) Tj
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
      `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf-8')} >>\nstream\n${contentStream}\nendstream\nendobj`
    );
    objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
    objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');

    let pdf = '%PDF-1.4\n';
    const xrefOffsets = [0];

    for (let i = 0; i < objects.length; i++) {
      xrefOffsets.push(Buffer.byteLength(pdf, 'utf-8'));
      pdf += objects[i] + '\n';
    }

    const startXref = Buffer.byteLength(pdf, 'utf-8');
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

    return Buffer.from(pdf, 'utf-8');
  }

  /**
   * Formata a linha digitável com espaçamento de leitura (47 dígitos bancário ou 48 dígitos concessionária)
   */
  private formatLinhaDigitavel(linha: string): string {
    const clean = linha.replace(/\D/g, '');
    if (clean.length === 47) {
      return `${clean.slice(0, 5)}.${clean.slice(5, 10)} ${clean.slice(10, 15)}.${clean.slice(15, 21)} ${clean.slice(21, 26)}.${clean.slice(26, 32)} ${clean.slice(32, 33)} ${clean.slice(33)}`;
    }
    if (clean.length === 48) {
      return `${clean.slice(0, 12)} ${clean.slice(12, 24)} ${clean.slice(24, 36)} ${clean.slice(36, 48)}`;
    }
    return linha;
  }

  /**
   * Formata data YYYY-MM-DD para DD/MM/YYYY
   */
  private formatDate(dateStr: string): string {
    if (!dateStr || dateStr === '0000-00-00') return 'N/A';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  /**
   * Gera payload simulado no padrão EMV BR Code / PIX com Tag 54 em 2 dígitos estritos
   * e CRC16-CCITT (Tag 63) válido, exigido por leitores de QR Code.
   */
  private generatePixPayload(invoiceId: string, valor: number): string {
    const valorStr = valor.toFixed(2);
    const lengthStr = valorStr.length.toString().padStart(2, '0');
    const payloadWithoutCrc = `00020126580014br.gov.bcb.pix0136dbstelecom-${invoiceId}-pix@dbstelecom.com.br52040000530398654${lengthStr}${valorStr}5802BR5911DBS TELECOM6007CHAPECO62070503***6304`;
    return payloadWithoutCrc + this.crc16(payloadWithoutCrc);
  }

  /** CRC16-CCITT (polinômio 0x1021, init 0xFFFF) do BR Code em hex maiúsculo. */
  private crc16(payload: string): string {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Processa webhook de liquidação instantânea de PIX recebido do Gateway Bancário.
   *
   * Fluxo (idempotente):
   * 1. Dedupe persistido — a mesma liquidação reentregada pelo gateway é
   *    processada uma única vez, mesmo entre restarts/instâncias diferentes;
   * 2. Persistência do pagamento na tabela local `pix_payments` e invalidação
   *    do cache IXC, para que GET /invoices deixe de exibir a fatura como
   *    VENCIDO imediatamente (o ERP permanece como fonte de verdade para os
   *    demais campos);
   * 3. Reconciliação com o IXC em try/catch — falha do ERP NÃO derruba o
   *    webhook (o gateway reenviaria indefinidamente); registra e segue;
   * 4. Evento SSE + notificação push persistida.
   */
  async processPixWebhook(payload: PixWebhookPayload): Promise<{
    success: boolean;
    invoiceId: string;
    status: string;
    duplicate?: boolean;
    paidAt: string;
    amount: number;
    reconciliation?: PixReconciliationResult | null;
    persistedPayment?: PixPaymentRecord;
  }> {
    if (!payload.invoiceId || !payload.clientId) {
      throw new Error('Payload inválido: invoiceId e clientId são obrigatórios.');
    }

    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payload inválido: amount deve ser um valor positivo.');
    }

    const paidAt = payload.paidAt || new Date().toISOString();
    const dedupeKey = this.resolvePixDedupeKey(payload, amount, paidAt);

    // 1. Fast in-process check only. It never claims the event: the durable
    // transaction below is the authority and can safely be retried on error.
    if (this.isPixEventClaimed(dedupeKey, Date.now())) {
      console.info(
        `[FinancialService] Webhook PIX duplicado ignorado (idempotente): ${dedupeKey}`
      );
      return {
        success: true,
        duplicate: true,
        invoiceId: payload.invoiceId,
        status: 'PAGO',
        paidAt,
        amount,
      };
    }

    // 2. Event dedupe and payment persistence are one transaction. If either
    // INSERT fails, neither row exists and the gateway can retry safely.
    let persistedPayment: PixPaymentRecord;
    try {
      const db = getDatabase();
      await db.transaction([
        {
          text: 'INSERT INTO pix_webhook_events (event_id, invoice_id, processed_at) VALUES (?, ?, ?)',
          parameters: [dedupeKey, payload.invoiceId, new Date().toISOString()],
        },
        {
          text: `INSERT INTO pix_payments
             (invoice_id, client_id, txid, end_to_end_id, amount, paid_at, webhook_event_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          parameters: [
            payload.invoiceId,
            payload.clientId,
            payload.txid || null,
            payload.endToEndId || null,
            String(amount),
            paidAt,
            dedupeKey,
            new Date().toISOString(),
          ],
        },
      ]);
      ixcCache.invalidateClient(payload.clientId);
      persistedPayment = {
        id: dedupeKey,
        invoiceId: payload.invoiceId,
        clientId: payload.clientId,
        amount,
        paidAt,
      };
    } catch (e) {
      if (isUniqueViolation(e)) {
        this.claimPixEvent(dedupeKey, Date.now());
        return {
          success: true,
          duplicate: true,
          invoiceId: payload.invoiceId,
          status: 'PAGO',
          paidAt,
          amount,
        };
      }
      const persistenceError = new Error('Não foi possível persistir o pagamento PIX; o webhook deve ser reenviado.');
      (persistenceError as Error & { code?: string }).code = 'PIX_PERSISTENCE_FAILED';
      (persistenceError as Error & { cause?: unknown }).cause = e;
      throw persistenceError;
    }
    this.claimPixEvent(dedupeKey, Date.now());

    // 3. Reconciliação com o ERP (IXC). Falha aqui não derruba o webhook.
    let reconciliation: PixReconciliationResult | null = null;
    try {
      reconciliation = await this.reconcilePixPaymentWithIxc({
        invoiceId: payload.invoiceId,
        clientId: payload.clientId,
        amount,
        paidAt,
      });
    } catch (e) {
      console.warn('[FinancialService] Reconciliação IXC falhou (webhook continua válido):', e);
    }

    const eventData = {
      event: 'PIX_CONFIRMED',
      invoiceId: payload.invoiceId,
      clientId: payload.clientId,
      amount,
      paidAt,
      webhookEventId: dedupeKey,
      message: 'Fatura Paga com Sucesso!',
    };

    // 4a. Dispara evento reativo para conexões SSE ativas
    this.pixEvents.emit(`pix:${payload.clientId}`, eventData);
    this.pixEvents.emit(`pix:invoice:${payload.invoiceId}`, eventData);

    // 4b. Registra notificação push para o assinante
    try {
      await notificationsService.sendNotification({
        clientId: payload.clientId,
        type: 'SYSTEM_NOTICE',
        title: '✅ Pagamento PIX Confirmado!',
        body: `Sua fatura #${payload.invoiceId} foi compensada com sucesso. Seu sinal e benefícios estão 100% liberados!`,
        actionType: 'VIEW_INVOICE',
        actionPayload: payload.invoiceId,
      });
    } catch (e) {
      console.warn('[FinancialService] Não foi possível salvar notificação do PIX:', e);
    }

    return {
      success: true,
      invoiceId: payload.invoiceId,
      status: 'PAGO',
      paidAt,
      amount,
      reconciliation,
      persistedPayment,
    };
  }

  /**
   * Chave de dedupe do webhook PIX: usa o identificador oficial do evento
   * quando presente (txid/endToEndId); caso contrário deriva um hash estável
   * de (fatura + valor pago + data de pagamento), tolerando reenvios com
   * timestamp de roteamento diferente.
   */
  private resolvePixDedupeKey(payload: PixWebhookPayload, amount: number, paidAt: string): string {
    // Atenção: payload.event é o TIPO do evento (ex.: 'pix.payment.received'),
    // não um identificador único — nunca usar como chave de dedupe.
    const eventId = payload.txid || payload.endToEndId;
    if (eventId) return `evt:${String(eventId)}`;

    const normalizedDate = /^\d{4}-\d{2}-\d{2}/.test(paidAt) ? paidAt.slice(0, 10) : paidAt;
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${payload.clientId}|${payload.invoiceId}|${amount.toFixed(2)}|${normalizedDate}`)
      .digest('hex');
    return `fp:${fingerprint}`;
  }

  /** Returns the canonical replay/idempotency key before side effects occur. */
  getPixWebhookDedupeKey(payload: PixWebhookPayload): string {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !payload.invoiceId || !payload.clientId) {
      throw new Error('Payload inválido: invoiceId, clientId e amount são obrigatórios.');
    }
    return this.resolvePixDedupeKey(payload, amount, payload.paidAt || new Date().toISOString());
  }

  /**
   * Reconciliação com o IXC Soft usando as mesmas funções do fluxo de faturas:
   * marca baixa manual da fatura (`fn_areceber`, espelhando unblockPromise) e
   * registra observação no chamado de cobrança via createTicket. Qualquer erro
   * é propagado ao chamador, que decide continuar sem falhar o webhook.
   */
  async reconcilePixPaymentWithIxc(input: {
    invoiceId: string;
    clientId: string;
    amount: number;
    paidAt: string;
  }): Promise<PixReconciliationResult> {
    const result: PixReconciliationResult = { attempted: true, errors: [] };

    // Marca a baixa da fatura no ERP through the explicit write operation.
    try {
      const update = await ixcService.updateInvoicePayment(input.invoiceId, {
        paidAt: input.paidAt.slice(0, 10),
        amount: input.amount.toFixed(2),
      });
      if (update.success && !update.simulated) result.invoiceMarkedPaid = true;
    } catch (e) {
      result.errors.push(`fn_areceber update failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Abre registro de conciliação no ERP para auditoria financeira.
    try {
      const ticket = await ixcService.createTicket({
        id_cliente: input.clientId,
        assunto: 'Conciliação automática de pagamento PIX',
        mensagem:
          `Pagamento PIX confirmado em ${input.paidAt}. Fatura ${input.invoiceId} no valor de R$ ${input.amount.toFixed(2)} liquidada; conciliação gerada automaticamente pelo webhook.`,
      });
      if (ticket.success && !ticket.simulated) {
        result.ticketCreated = true;
        result.protocol = ticket.protocolo;
      }
    } catch (e) {
      result.errors.push(`createTicket failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return result;
  }

  /** Consulta o último pagamento PIX persistido de uma fatura (uso interno/testes). */
  async getLatestPixPayment(invoiceId: string): Promise<PixPaymentRow | undefined> {
    return await getDatabase()
      .prepare(
        `SELECT * FROM pix_payments WHERE invoice_id = ? ORDER BY paid_at DESC LIMIT 1`
      )
      .get<PixPaymentRow>(invoiceId);
  }

  /** Reads durable payment state so SSE can recover events handled elsewhere. */
  async getLatestPixPaymentForClient(clientId: string, since?: string): Promise<PixPaymentRow | undefined> {
    if (since) {
      return await getDatabase().prepare(`
        SELECT id, invoice_id, client_id, txid, end_to_end_id, amount, paid_at, webhook_event_id, created_at
        FROM pix_payments
        WHERE client_id = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1
      `).get<PixPaymentRow>(clientId, since);
    }
    return await getDatabase().prepare(`
      SELECT id, invoice_id, client_id, txid, end_to_end_id, amount, paid_at, webhook_event_id, created_at
      FROM pix_payments WHERE client_id = ? ORDER BY created_at DESC LIMIT 1
    `).get<PixPaymentRow>(clientId);
  }

  /**
   * Verifies the HMAC signature over the exact request bytes. Callers must
   * still enforce a timestamp and event-id replay window around this check.
   */
  verifyPixWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!CONFIG.pix.webhookSecret || !signature) return false;
    const provided = signature.trim().replace(/^sha256=/i, '');
    if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
    const expected = crypto.createHmac('sha256', CONFIG.pix.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const providedBuffer = Buffer.from(provided, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  }

  /** Claims an external event id once for the replay-protection window. */
  claimPixEvent(eventId: string, now = Date.now(), ttlMs = PIX_EVENT_TTL_MS): boolean {
    for (const [id, expiresAt] of this.processedPixEvents) {
      if (expiresAt <= now) this.processedPixEvents.delete(id);
    }
    if (!eventId || this.processedPixEvents.has(eventId)) return false;
    this.processedPixEvents.set(eventId, now + ttlMs);
    return true;
  }

  private isPixEventClaimed(eventId: string, now = Date.now()): boolean {
    for (const [id, expiresAt] of this.processedPixEvents) {
      if (expiresAt <= now) this.processedPixEvents.delete(id);
    }
    return Boolean(eventId && this.processedPixEvents.has(eventId));
  }

  /**
   * Idempotência PERSISTIDA do webhook PIX.
   *
   * Camada 1 (rápida): Map em memória — cobre rajadas de reentrega na mesma
   * instância sem tocar o banco.
   * Camada 2 (durável): tabela `pix_webhook_events` (migration 0003). Sobrevive
   * a restart e é compartilhada entre instâncias/isolates; INSERT concorrente
   * no mesmo event_id só entra uma vez (PRIMARY KEY).
   *
   * Retorna false quando o evento já foi processado em qualquer camada.
   */
  async claimPixEventPersisted(dedupeKey: string, invoiceId?: string, now = Date.now()): Promise<boolean> {
    if (this.isPixEventClaimed(dedupeKey, now)) return false;

    try {
      // event_id guarda a chave canônica (evt:<txid> ou fp:<hash>); o
      // processed_at explícito mantém o INSERT compatível com Postgres
      // (timestamptz) e com o espelho SQLite usado nos testes.
      await getDatabase()
        .prepare('INSERT INTO pix_webhook_events (event_id, invoice_id, processed_at) VALUES (?, ?, ?)')
        .run(dedupeKey, invoiceId || null, new Date().toISOString());
      this.claimPixEvent(dedupeKey, now);
      return true;
    } catch (e: any) {
      // Violação de PK/unique => evento já processado por outra execução.
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }

  /** Useful for isolated tests without exposing the internal replay map. */
  clearPixEventClaims(): void {
    this.processedPixEvents.clear();
  }

  /** Limpa também as chaves de idempotência persistidas (isolamento de testes). */
  async clearPersistedPixEventClaims(): Promise<void> {
    this.clearPixEventClaims();
    try {
      await getDatabase().prepare('DELETE FROM pix_webhook_events').run();
    } catch (e) {
      console.warn('[FinancialService] Não foi possível limpar dedupe persistido:', e);
    }
  }
}

export const financialService = new FinancialService();

function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = String(value?.code || '');
  const message = String(value?.message || error || '');
  return code === '23505' || /unique constraint|duplicate key|already exists/i.test(message);
}
