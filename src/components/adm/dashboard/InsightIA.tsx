import { Sparkles, TrendingDown, TrendingUp, Target, Award, Wallet, Percent } from 'lucide-react';
import { brl } from '../../../lib/format';
import type { BarraDia } from './GraficoBarras';
import type { SaborTop } from './GraficoTopSabores';

/**
 * Painel de Insights — várias sugestões acionáveis geradas a partir dos dados reais
 * (heurísticas sobre os números, sem custo de API). Cada regra vira um cartão com
 * ícone, tom (alerta/oportunidade/positivo) e um texto direto sobre o que fazer.
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
  texto: string;
}

const TOM_STYLE: Record<Insight['tom'], { bg: string; border: string; icon: string }> = {
  alerta: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600' },
  oportunidade: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600' },
  positivo: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600' },
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
      texto: `Sua margem está em ${margem.toFixed(0)}% — abaixo do saudável (ideal acima de 40%). Reveja o custo dos ingredientes ou reajuste o preço dos itens mais vendidos.`,
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
        texto: `${pior.dia} vem sendo o dia mais fraco (${brl(pior.valor)}, ${Math.round((1 - pior.valor / media) * 100)}% abaixo da média). Uma promoção só nesse dia pode ajudar a girar mais.`,
      });
    }
  }

  if (faturamentoAnterior > 0) {
    const variacao = ((faturamento - faturamentoAnterior) / faturamentoAnterior) * 100;
    if (variacao <= -20) {
      insights.push({
        tom: 'alerta',
        icon: TrendingDown,
        texto: `Faturamento ${Math.abs(variacao).toFixed(0)}% menor que o período anterior (${brl(faturamentoAnterior)} → ${brl(faturamento)}). Vale checar se algo mudou: horário de funcionamento, tempo de entrega, ou concorrência.`,
      });
    } else if (variacao >= 20) {
      insights.push({
        tom: 'positivo',
        icon: TrendingUp,
        texto: `Faturamento ${variacao.toFixed(0)}% maior que o período anterior. O que funcionou dessa vez vale repetir — promoção, divulgação ou item novo?`,
      });
    }
  }

  if (meta > 0 && faturamento > 0 && faturamento < meta) {
    const falta = meta - faturamento;
    if (falta <= meta * 0.2) {
      insights.push({
        tom: 'oportunidade',
        icon: Target,
        texto: `Você está a apenas ${brl(falta)} de bater a meta. Um empurrãozinho no delivery fecha com chave de ouro! 🚀`,
      });
    }
  } else if (meta > 0 && faturamento >= meta) {
    insights.push({
      tom: 'positivo',
      icon: Target,
      texto: `Meta batida! Faturamento de ${brl(faturamento)} já passou os ${brl(meta)} planejados.`,
    });
  }

  if (topSabor) {
    insights.push({
      tom: 'oportunidade',
      icon: Award,
      texto: `${topSabor.nome} é o campeão de vendas (${topSabor.quantidade} un). Garanta o estoque desse item para não perder venda, e considere destacá-lo no cardápio.`,
    });
  }

  if (ticketMedio > 0) {
    insights.push({
      tom: 'oportunidade',
      icon: Wallet,
      texto: `Ticket médio de ${brl(ticketMedio)}. Sugerir bebida ou sobremesa no fechamento do pedido é a forma mais simples de aumentar esse valor.`,
    });
  }

  if (formaPagamentoDominante && formaPagamentoDominante.pct >= 60) {
    insights.push({
      tom: 'oportunidade',
      icon: Percent,
      texto: `${formaPagamentoDominante.pct.toFixed(0)}% dos pagamentos são em ${formaPagamentoDominante.forma}. Vale avaliar taxas/prazos das outras formas para diversificar o recebimento.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      tom: 'oportunidade',
      icon: Sparkles,
      texto: 'Ainda não há vendas suficientes no período para gerar uma sugestão. Assim que entrarem pedidos, trago insights aqui.',
    });
  }

  return insights;
}

export function InsightIA(props: Props) {
  const insights = gerarInsights(props);
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-600 to-green-500 flex items-center justify-center flex-shrink-0">
          <Sparkles size={16} className="text-white" />
        </div>
        <h3 className="text-neutral-900 font-bold">Insights &amp; o que fazer para vender mais</h3>
      </div>
      <div className="space-y-2.5">
        {insights.map((insight, i) => {
          const style = TOM_STYLE[insight.tom];
          return (
            <div key={i} className={`flex gap-3 rounded-xl p-3.5 border ${style.bg} ${style.border}`}>
              <insight.icon size={18} className={`${style.icon} flex-shrink-0 mt-0.5`} />
              <p className="text-neutral-800 text-sm leading-relaxed">{insight.texto}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
