import { supabase } from './supabase';
import { dateTimeToISO, dateToISO } from './dateUtils';
import { calcularDespesaOperacional } from './reportUtils';

// Faturamento real (pedidos não cancelados) num intervalo — fonte única para
// "faturamento de hoje/mês", que antes tinha uma query com limites de dia
// escritos à mão em cada tela (Dashboard, Metas), cada uma podendo divergir
// se um fix de fuso horário for aplicado só numa delas.
export async function buscarFaturamentoPeriodo(inicio: Date, fim: Date): Promise<number> {
  const { data } = await supabase
    .from('pedidos')
    .select('total')
    .gte('created_at', dateTimeToISO(inicio))
    .lte('created_at', dateTimeToISO(fim))
    .neq('status', 'cancelado');
  return (data || []).reduce((s: number, p: { total: number }) => s + Number(p.total), 0);
}

// Despesa operacional real (tabela `caixa`, tipo='saida') num intervalo de
// datas (formato YYYY-MM-DD, mesmo formato da coluna `caixa.data`).
export async function buscarDespesaOperacionalPeriodo(inicioISO: string, fimISO: string): Promise<number> {
  const { data } = await supabase
    .from('caixa')
    .select('valor')
    .eq('tipo', 'saida')
    .gte('data', inicioISO)
    .lte('data', fimISO);
  return calcularDespesaOperacional(data || []);
}

export async function buscarDespesaOperacionalDia(diaISO: string): Promise<number> {
  return buscarDespesaOperacionalPeriodo(diaISO, diaISO);
}

export { dateToISO };
