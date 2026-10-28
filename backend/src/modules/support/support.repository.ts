import { getDatabase } from '../../database/db.js';
import { DiagnosticState, DiagnosticStep } from './support.service.js';
import { IXCTicketRecord } from '../ixc/ixc.types.js';

export class SupportRepository {
  async saveDiagnosticState(state: DiagnosticState): Promise<void> {
    await getDatabase().prepare(`
      INSERT INTO support_diagnostics (client_id, step, multiple_devices, cables_checked, restarted, protocolo, ticket_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET step = excluded.step, multiple_devices = excluded.multiple_devices,
        cables_checked = excluded.cables_checked, restarted = excluded.restarted, protocolo = excluded.protocolo,
        ticket_id = excluded.ticket_id, updated_at = excluded.updated_at
    `).run(state.clientId, state.step, state.multipleDevices === undefined ? null : Number(state.multipleDevices),
      state.cablesChecked === undefined ? null : Number(state.cablesChecked), state.restarted === undefined ? null : Number(state.restarted),
      state.protocolo || null, state.ticketId || null, state.updatedAt || Date.now());
  }

  async getDiagnosticState(clientId: string): Promise<DiagnosticState | undefined> {
    const row = await getDatabase().prepare(`
      SELECT client_id, step, multiple_devices, cables_checked, restarted, protocolo, ticket_id, updated_at
      FROM support_diagnostics WHERE client_id = ?
    `).get<any>(clientId);
    if (!row) return undefined;
    if (Date.now() - Number(row.updated_at) > 60 * 60 * 1000) {
      await this.deleteDiagnosticState(clientId);
      return undefined;
    }
    return { clientId: row.client_id, step: row.step as DiagnosticStep,
      multipleDevices: row.multiple_devices === null ? undefined : Number(row.multiple_devices) === 1,
      cablesChecked: row.cables_checked === null ? undefined : Number(row.cables_checked) === 1,
      restarted: row.restarted === null ? undefined : Number(row.restarted) === 1,
      protocolo: row.protocolo || undefined, ticketId: row.ticket_id || undefined, updatedAt: Number(row.updated_at) };
  }

  async deleteDiagnosticState(clientId: string): Promise<void> {
    await getDatabase().prepare('DELETE FROM support_diagnostics WHERE client_id = ?').run(clientId);
  }

  /**
   * Atomically claims the only side-effecting transition in the diagnostic
   * flow. This closes the race where two requests both read STEP_3_RESTART
   * before either one has created the IXC ticket.
   */
  async claimDiagnosticEscalation(clientId: string, now = Date.now()): Promise<boolean> {
    const result = await getDatabase().prepare(`
      UPDATE support_diagnostics
      SET step = 'ESCALATED', updated_at = ?
      WHERE client_id = ? AND step = 'STEP_3_RESTART'
    `).run(now, clientId);
    return result.changes > 0;
  }

  async saveUserTicket(ticket: IXCTicketRecord): Promise<void> {
    await getDatabase().prepare(`
      INSERT INTO user_tickets (id, client_id, id_contrato, tipo, assunto, mensagem, status, status_label, prioridade, protocolo, data_abertura, nome_tecnico, previsao_visita, etapas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, id_contrato = excluded.id_contrato, tipo = excluded.tipo,
        assunto = excluded.assunto, mensagem = excluded.mensagem, status = excluded.status, status_label = excluded.status_label,
        prioridade = excluded.prioridade, protocolo = excluded.protocolo, data_abertura = excluded.data_abertura,
        nome_tecnico = excluded.nome_tecnico, previsao_visita = excluded.previsao_visita, etapas = excluded.etapas
    `).run(ticket.id, ticket.id_cliente, ticket.id_contrato || null, ticket.tipo || 'C', ticket.assunto, ticket.mensagem || null,
      ticket.status, ticket.statusLabel || null, ticket.prioridade || 'A', ticket.protocolo || null, ticket.data_abertura,
      ticket.nome_tecnico || null, ticket.previsao_visita || null, ticket.etapas ? JSON.stringify(ticket.etapas) : null);
  }

  async getUserTickets(clientId: string): Promise<IXCTicketRecord[]> {
    const rows = await getDatabase().prepare(`
      SELECT id, client_id, id_contrato, tipo, assunto, mensagem, status, status_label, prioridade, protocolo,
             data_abertura, nome_tecnico, previsao_visita, etapas FROM user_tickets
      WHERE client_id = ? ORDER BY data_abertura DESC
    `).all<any>(clientId);
    return rows.map((row) => ({ id: row.id, id_cliente: row.client_id, id_contrato: row.id_contrato || undefined,
      tipo: row.tipo, assunto: row.assunto, mensagem: row.mensagem || undefined, status: row.status,
      statusLabel: row.status_label || undefined, prioridade: row.prioridade, protocolo: row.protocolo || undefined,
      data_abertura: row.data_abertura, nome_tecnico: row.nome_tecnico || undefined,
      previsao_visita: row.previsao_visita || undefined, etapas: parseJson(row.etapas) }));
  }

  async clearAll(): Promise<void> {
    await getDatabase().transaction([{ text: 'DELETE FROM support_diagnostics' }, { text: 'DELETE FROM user_tickets' }]);
  }
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
}

export const supportRepository = new SupportRepository();
