import { Sparkles } from 'lucide-react';
import { brl } from '../../../lib/format';
import type { BarraDia } from './GraficoBarras';
import type { SaborTop } from './GraficoTopSabores';

/**
 * Card de Insight — uma frase de sugestão gerada a partir dos dados reais.
 * É heurístico (regras sobre os números), sem custo de API: escolhe o insight mais
 * relevante do momento (dia fraco, margem baixa, ticket, meta, campeão de vendas).
 */
interface Props {
  margem: number;          // % de lucro sobre a venda bruta
  ticketMedio: number;
  faturamento: number;
  meta: number;
  seteDias: BarraDia[];    // faturamento por dia (para achar o dia mais fraco)
  topSabor: SaborTop | null;
}

// Monta a lista de insights aplicáveis e devolve o de maior prioridade
function gerarInsight({ margem, ticketMedio, faturamento, meta, seteDias, topSabor }: Props): string {
  // 1. Margem baixa é o alerta mais importante
  if (faturamento > 0 && margem < 40) {
    return `Sua margem está em ${margem.toFixed(0)}% — abaixo do saudável. Reveja custos dos ingredientes ou os preços dos itens mais vendidos.`;
  }

  // 2. Dia da semana mais fraco (entre dias com alguma referência de venda)
  const diasComVenda = seteDias.filter((d) => d.valor > 0);
  if (diasComVenda.length >= 3) {
    const pior = [...diasComVenda].sort((a, b) => a.valor - b.valor)[0];
    const media = diasComVenda.reduce((s, d) => s + d.valor, 0) / diasComVenda.length;
    if (pior.valor < media * 0.6) {
      return `${pior.dia} vem sendo o dia mais fraco (${brl(pior.valor)}). Que tal uma promoção só nesse dia para girar mais?`;
    }
  }

  // 3. Meta do dia perto de bater
  if (meta > 0 && faturamento > 0 && faturamento < meta) {
    const falta = meta - faturamento;
    if (falta <= meta * 0.2) {
      return `Você está a apenas ${brl(falta)} de bater a meta do dia. Um empurrãozinho no delivery fecha com chave de ouro! 🚀`;
    }
  }

  // 4. Campeão de vendas
  if (topSabor) {
    return `${topSabor.nome} é o campeão de vendas (${topSabor.quantidade} un). Garanta o estoque desse sabor para não perder venda.`;
  }

  // 5. Ticket médio
  if (ticketMedio > 0) {
    return `Ticket médio de ${brl(ticketMedio)}. Sugerir bebida ou sobremesa no fechamento pode aumentar esse valor.`;
  }

  return 'Ainda não há vendas suficientes no período para gerar uma sugestão. Assim que entrarem pedidos, trago um insight aqui.';
}

export function InsightIA(props: Props) {
  const frase = gerarInsight(props);
  return (
    <div className="bg-gradient-to-br from-[#E50914]/15 to-[#FFD700]/5 border border-[#E50914]/30 rounded-2xl p-5 flex gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#E50914] flex items-center justify-center flex-shrink-0">
        <Sparkles size={18} className="text-white" />
      </div>
      <div>
        <p className="text-[#FFD700] text-xs font-bold uppercase tracking-wide mb-1">Insight do dia</p>
        <p className="text-neutral-200 text-sm leading-relaxed">{frase}</p>
      </div>
    </div>
  );
}
