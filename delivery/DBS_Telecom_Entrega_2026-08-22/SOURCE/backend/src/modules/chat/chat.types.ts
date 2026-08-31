import type { DepartmentType } from '../ai/ai.service.js';
import type { DBSPlan } from '../commercial/commercial.service.js';
import type { FormattedInvoice } from '../financial/financial.service.js';
import type { QueueEntry } from '../queue/queue.service.js';

/**
 * Public message shape returned by the chat API.
 *
 * This lives outside the orchestration service so persistence, route handlers,
 * and extracted conversation workflows can share the same contract without a
 * dependency cycle through ChatService.
 */
export interface ChatMessage {
  id: string;
  sender: 'USER' | 'BOT' | 'SYSTEM';
  text: string;
  timestamp: string;
  department?: DepartmentType;
  quickOptions?: string[];
  aiProvider?: string;
  aiModel?: string;
  guardrailApplied?: boolean;
  cards?: {
    type: 'INVOICE' | 'PLANS' | 'DIAGNOSTIC' | 'TICKET' | 'CSAT' | 'QUEUE' | 'AUDIO';
    invoices?: FormattedInvoice[];
    plans?: DBSPlan[];
    ticketProtocol?: string;
    csat?: {
      id: string;
      question: string;
      context: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
      targetProtocol?: string;
    };
    queue?: QueueEntry;
    audio?: {
      transcript: string;
      durationSeconds?: number;
      mimeType?: string;
    };
  };
}

export interface ChatSession {
  sessionId: string;
  clientId?: string;
  clientName?: string;
  currentDepartment: DepartmentType;
  history: ChatMessage[];
  createdAt: string;
}

export function generateMsgId(prefix: string = 'msg'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
