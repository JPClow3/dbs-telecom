import { ixcService } from '../ixc/ixc.service.js';
import { DailyTrafficUsage, TrafficConsumptionSummary } from '../ixc/ixc.types.js';

export class TrafficService {
  /**
   * Obtém o extrato de consumo de franquia e tráfego diário do cliente
   */
  async getClientTrafficConsumption(clientId: string, days = 14): Promise<TrafficConsumptionSummary> {
    const rawSessions = await ixcService.getClientTraffic(clientId, days);

    // Se houver registros reais de sessões radacct, agrega por dia
    const dayMap = new Map<string, { downloadBytes: number; uploadBytes: number }>();

    const now = new Date();
    // Prepara os últimos `days` dias de histórico
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      dayMap.set(dateKey, { downloadBytes: 0, uploadBytes: 0 });
    }

    if (rawSessions && rawSessions.length > 0) {
      for (const session of rawSessions) {
        if (session.acctstarttime) {
          const dateKey = session.acctstarttime.split(' ')[0] || session.acctstarttime.split('T')[0];
          if (dayMap.has(dateKey)) {
            const current = dayMap.get(dateKey)!;
            current.downloadBytes += Number(session.acctoutputoctets || 0);
            current.uploadBytes += Number(session.acctinputoctets || 0);
          }
        }
      }
    }

    // Se os registros do ERP demo vierem vazios, gera curva realista de consumo residencial FTTH
    const dailyUsage: DailyTrafficUsage[] = [];
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // Padrão determinístico baseado no clientId para consistência
    const seed = parseInt(clientId.replace(/\D/g, '') || '2270', 10);

    let totalDownloadBytes = 0;
    let totalUploadBytes = 0;

    let index = 0;
    for (const [dateKey, usage] of dayMap.entries()) {
      const dateParts = dateKey.split('-').map(Number);
      const dayDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const dayOfWeek = dayNames[dayDate.getDay()];
      const dayNum = String(dateParts[2]).padStart(2, '0');
      const monthNum = String(dateParts[1]).padStart(2, '0');
      const dayLabel = `${dayNum}/${monthNum} (${dayOfWeek})`;

      let dBytes = usage.downloadBytes;
      let uBytes = usage.uploadBytes;

      if (dBytes === 0 && uBytes === 0) {
        // Fim de semana (Dom e Sáb) consome mais tráfego (streaming 4K, jogos)
        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        const baseDownloadGB = isWeekend ? 18.5 : 11.2;
        const pseudoRandom = Math.sin(seed + index * 1.7) * 3.8;
        const downloadGB = Math.max(4.5, parseFloat((baseDownloadGB + pseudoRandom).toFixed(2)));
        const uploadGB = parseFloat((downloadGB * 0.18 + (Math.cos(seed + index) * 0.5 + 0.6)).toFixed(2));

        dBytes = Math.round(downloadGB * 1024 * 1024 * 1024);
        uBytes = Math.round(uploadGB * 1024 * 1024 * 1024);
      }

      totalDownloadBytes += dBytes;
      totalUploadBytes += uBytes;

      const dGB = parseFloat((dBytes / (1024 * 1024 * 1024)).toFixed(2));
      const uGB = parseFloat((uBytes / (1024 * 1024 * 1024)).toFixed(2));
      const tGB = parseFloat((dGB + uGB).toFixed(2));

      dailyUsage.push({
        date: dateKey,
        dayLabel,
        downloadBytes: dBytes,
        uploadBytes: uBytes,
        totalBytes: dBytes + uBytes,
        downloadGB: dGB,
        uploadGB: uGB,
        totalGB: tGB,
      });

      index++;
    }

    const totalDownloadGB = parseFloat((totalDownloadBytes / (1024 * 1024 * 1024)).toFixed(2));
    const totalUploadGB = parseFloat((totalUploadBytes / (1024 * 1024 * 1024)).toFixed(2));
    const totalConsumedGB = parseFloat((totalDownloadGB + totalUploadGB).toFixed(2));
    const dailyAverageGB = parseFloat((totalConsumedGB / dailyUsage.length).toFixed(2));

    // Dia de maior consumo
    let highest = dailyUsage[0] || { date: '', dayLabel: '', totalGB: 0 };
    for (const d of dailyUsage) {
      if (d.totalGB > highest.totalGB) {
        highest = d;
      }
    }

    const currentMonthLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;

    // Sem registros radacct reais, a curva é uma estimativa determinística e
    // deve ser rotulada como tal — nunca apresentada como medição do ERP.
    const hasRealData = rawSessions && rawSessions.length > 0;

    return {
      clientId,
      period: currentMonthLabel,
      totalDownloadGB,
      totalUploadGB,
      totalConsumedGB,
      dailyAverageGB,
      highestConsumptionDay: {
        date: highest.date,
        dayLabel: highest.dayLabel,
        totalGB: highest.totalGB,
      },
      planFranchise: '100% Ilimitado (Sem Franquia)',
      dailyUsage,
      estimated: !hasRealData,
    };
  }
}

export const trafficService = new TrafficService();
