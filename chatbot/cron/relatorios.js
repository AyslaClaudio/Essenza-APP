// ============================================================================
// Agendamento dos relatórios automáticos (node-cron)
//
// - Relatório DIÁRIO: todo dia às 09:00 (resume o dia anterior).
// - Relatório SEMANAL: no dia de folga da loja, às 09:00 (resume os 7 dias).
//
// O dia de folga é configurável por env RELATORIO_SEMANAL_DIA (0=domingo ...
// 6=sábado; padrão 1 = segunda-feira, folga comum de pizzaria).
// Fuso fixado em America/Sao_Paulo para o horário bater com o da loja.
// ============================================================================

import cron from 'node-cron';
import { enviarRelatorioDiario, enviarRelatorioSemanal } from '../services/whatsappService.js';

const TZ = 'America/Sao_Paulo';

/**
 * Inicia os agendamentos. Deve ser chamado quando o WhatsApp já está conectado.
 * @param {() => object} getSock  Função que devolve o socket Baileys ativo (para
 *                                 pegar sempre a conexão mais recente após reconexões).
 * @param {object} supabase       Cliente Supabase.
 * @param {string} destinoPhone   Telefone que recebe os relatórios (OWNER_ALERT_PHONE).
 */
export function iniciarRelatoriosAgendados(getSock, supabase, destinoPhone) {
  if (!destinoPhone) {
    console.log('📭 Relatórios automáticos desativados: defina OWNER_ALERT_PHONE no .env para recebê-los.');
    return;
  }

  const diaSemanal = parseInt(process.env.RELATORIO_SEMANAL_DIA ?? '1'); // 1 = segunda
  const diaValido = Number.isInteger(diaSemanal) && diaSemanal >= 0 && diaSemanal <= 6 ? diaSemanal : 1;

  // Diário — todo dia 09:00
  cron.schedule('0 9 * * *', async () => {
    try {
      await enviarRelatorioDiario(getSock(), supabase, destinoPhone);
    } catch (e) {
      console.error('Erro ao enviar relatório diário:', e.message || e);
    }
  }, { timezone: TZ });

  // Semanal — no dia de folga, 09:00
  cron.schedule(`0 9 * * ${diaValido}`, async () => {
    try {
      await enviarRelatorioSemanal(getSock(), supabase, destinoPhone);
    } catch (e) {
      console.error('Erro ao enviar relatório semanal:', e.message || e);
    }
  }, { timezone: TZ });

  const nomesDias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  console.log(`📅 Relatórios agendados: diário 09:00 e semanal ${nomesDias[diaValido]} 09:00 (fuso ${TZ}). Enviando para ${destinoPhone}.`);
}
