import { Sparkles, TrendingDown, TrendingUp, Target, Award, Wallet, Percent } from 'lucide-react';
import { brl } from '../../../lib/format';
import type { BarraDia } from './GraficoBarras';
import type { SaborTop } from './GraficoTopSabores';

/**
 * Painel de Insights — várias sugestões acionáveis geradas a partir dos dados reais
 * (heurísticas sobre os números, sem custo de API). Cada regra vira um cartão com
 * ícone, tom (alerta/oportunidade/positivo), título curto e descrição.
 *
 * Mesma lógica de sempre (gerarInsights não mudou nenhuma condição/cálculo) — só
 * o texto de cada regra foi dividido em título + descrição pro visual novo.
 */
interface Props {
  margem: number;          // % de lucro sobre a venda bruta
  ticketMedio: number;
  faturamento: number;
  faturamentoAnterior: number;
  meta: number;
  seteDias: BarraDia[];    // faturamento por dia (para achar o dia mais fraco)
  topSabor: SaborTop | null;
  formaPagamentoDominante: { forma: string; pct: number } | null;
}

interface Insight {
  tom: 'alerta' | 'oportunidade' | 'positivo';
  icon: typeof Sparkles;
  titulo: string;
  texto: string;
}

const TOM_STYLE: Record<Insight['tom'], { bg: string; icon: string; dot: string }> = {
  alerta: { bg: 'bg-red-50', icon: 'text-[#EF4444]', dot: 'bg-[#EF4444]' },
  oportunidade: { bg: 'bg-amber-50', icon: 'text-[#F59E0B]', dot: 'bg-[#F59E0B]' },
  positivo: { bg: 'bg-[#DCFCE7]', icon: 'text-[#B91C1C]', dot: 'bg-[#B91C1C]' },
};

// Monta a lista de insights aplicáveis aos dados atuais, sem limite — cada regra
// independente entra se a condição bater (dá pra ter vários insights ao mesmo tempo).
function gerarInsights(props: Props): Insight[] {
  const { margem, ticketMedio, faturamento, faturamentoAnterior, meta, seteDias, topSabor, formaPagamentoDominante } = props;
  const insights: Insight[] = [];

  if (faturamento > 0 && margem < 40) {
    insights.push({
      tom: 'alerta',
      icon: Percent,
      titulo: 'Margem abaixo do saudável',
      texto: `Sua margem está em ${margem.toFixed(0)}% (ideal acima de 40%). Reveja o custo dos ingredientes ou reajuste o preço dos itens mais vendidos.`,
    });
  }

  const diasComVenda = seteDias.filter((d) => d.valor > 0);
  if (diasComVenda.length >= 3) {
    const pior = [...diasComVenda].sort((a, b) => a.valor - b.valor)[0];
    const media = diasComVenda.reduce((s, d) => s + d.valor, 0) / diasComVenda.length;
    if (pior.valor < media * 0.6) {
      insights.push({
        tom: 'oportunidade',
        icon: TrendingDown,
        titulo: `${pior.dia} está abaixo do potencial`,
        texto: `O faturamento de ${pior.dia} está ${Math.round((1 - pior.valor / media) * 100)}% abaixo da média da semana (${brl(pior.valor)}). Uma promoção só nesse dia pode ajudar a girar mais.`,
      });
    }
  }

  if (faturamentoAnterior > 0) {
    const variacao = ((faturamento - faturamentoAnterior) / faturamentoAnterior) * 100;
    if (variacao <= -20) {
      insights.push({
        tom: 'alerta',
        icon: TrendingDown,
        titulo: 'Faturamento em queda',
        texto: `${Math.abs(variacao).toFixed(0)}% menor que o período anterior (${brl(faturamentoAnterior)} → ${brl(faturamento)}). Vale checar se algo mudou: horário de funcionamento, tempo de entrega, ou concorrência.`,
      });
    } else if (variacao >= 20) {
      insights.push({
        tom: 'positivo',
        icon: TrendingUp,
        titulo: 'Ticket médio em alta',
        texto: `Faturamento ${variacao.toFixed(0)}% maior que o período anterior. O que funcionou dessa vez vale repetir — promoção, divulgação ou item novo?`,
      });
    }
  }

  if (meta > 0 && faturamento > 0 && faturamento < meta) {
    const falta = meta - faturamento;
    const pctMeta = (faturamento / meta) * 100;
    if (falta <= meta * 0.2) {
      insights.push({
        tom: 'oportunidade',
        icon: Target,
        titulo: 'Meta quase batida',
        texto: `Você está em ${pctMeta.toFixed(0)}% da meta de hoje — faltam só ${brl(falta)}. Um empurrãozinho no delivery fecha com chave de ouro.`,
      });
    } else {
      insights.push({
        tom: 'oportunidade',
        icon: Target,
        titulo: 'Meta do período',
        texto: `Você está em ${pctMeta.toFixed(0)}% da meta (${brl(faturamento)} de ${brl(meta)}).`,
      });
    }
  } else if (meta > 0 && faturamento >= meta) {
    insights.push({
      tom: 'positivo',
      icon: Target,
      titulo: 'Meta batida',
      texto: `Faturamento de ${brl(faturamento)} já passou os ${brl(meta)} planejados.`,
    });
  }

  if (topSabor) {
    insights.push({
      tom: 'oportunidade',
      icon: Award,
      titulo: 'Produto em destaque',
      texto: `${topSabor.nome} é o campeão de vendas (${topSabor.quantidade} un). Garanta o estoque desse item para não perder venda, e considere destacá-lo no cardápio.`,
    });
  }

  if (ticketMedio > 0) {
    insights.push({
      tom: 'oportunidade',
      icon: Wallet,
      titulo: 'Oportunidade de upsell',
      texto: `Ticket médio de ${brl(ticketMedio)}. Sugerir bebida ou sobremesa no fechamento do pedido é a forma mais simples de aumentar esse valor.`,
    });
  }

  if (formaPagamentoDominante && formaPagamentoDominante.pct >= 60) {
    insights.push({
      tom: 'oportunidade',
      icon: Percent,
      titulo: 'Forma de pagamento concentrada',
      texto: `${formaPagamentoDominante.pct.toFixed(0)}% dos pagamentos são em ${formaPagamentoDominante.forma}. Vale avaliar taxas/prazos das outras formas para diversificar o recebimento.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      tom: 'oportunidade',
      icon: Sparkles,
      titulo: 'Sem dados suficientes ainda',
      texto: 'Ainda não há vendas suficientes no período para gerar uma sugestão. Assim que entrarem pedidos, trago insights aqui.',
    });
  }

  return insights;
}

export function InsightIA(props: Props) {
  const insights = gerarInsights(props);
  return (
    <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
          <Sparkles size={16} className="text-[#B91C1C]" />
        </div>
        <h3 className="text-[#171717] font-semibold">Insights da Essenza</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.map((insight, i) => {
          const style = TOM_STYLE[insight.tom];
          return (
            <div key={i} className={`flex gap-3 rounded-xl p-4 ${style.bg}`}>
              <insight.icon size={18} className={`${style.icon} flex-shrink-0 mt-0.5`} />
              <div className="min-w-0">
                <p className="text-[#171717] text-sm font-semibold mb-0.5">{insight.titulo}</p>
                <p className="text-[#737373] text-xs leading-relaxed">{insight.texto}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
