import { supabase } from './supabase';
import { dateToISO } from './dateUtils';

// Fonte única pra "custos operacionais" (salário, aluguel, contas — tudo que
// não é custo de produto vendido). Lançados na tela Custos Operacionais,
// gravados na tabela `caixa` com tipo='saida'. Dashboard, Financeiro >
// Relatórios (Lucro Líquido) e a própria tela de Custos Operacionais
// precisam somar exatamente os mesmos registros pro mesmo período — antes
// cada tela tinha sua própria query (ou, no caso do Lucro Líquido, nem
// chegava a consultar essa tabela, usando uma despesa fixa configurada à
// parte) e os números descolavam entre as telas.
export interface CustoOperacionalEntry {
  id: string;
  descricao: string;
  valor: number;
  data: string;
}

export async function buscarCustosOperacionais(ini: Date, fim: Date): Promise<{ total: number; entries: CustoOperacionalEntry[] }> {
  const { data, error } = await supabase
    .from('caixa')
    .select('id, descricao, valor, data')
    .eq('tipo', 'saida')
    .gte('data', dateToISO(ini))
    .lte('data', dateToISO(fim))
    .order('data', { ascending: false });
  if (error) {
    // Log em vez de engolir — se essa busca falhar (RLS, coluna, etc.), o
    // sintoma antes era "lancei o custo e não aparece em lugar nenhum", sem
    // nenhum indício do motivo real.
    console.error('Erro ao buscar custos operacionais:', error);
  }
  const entries = (data as CustoOperacionalEntry[]) || [];
  const total = entries.reduce((s, e) => s + Number(e.valor || 0), 0);
  return { total, entries };
}
