import { Flame, Pizza, Croissant, CupSoda } from 'lucide-react';

/**
 * Imagem padrão de um produto quando não há foto — ou quando queremos uma
 * imagem uniforme por categoria (pizza, esfirra, bebida) em vez de fotos
 * avulsas de qualidade/estilo variado. Ícone lucide (mesma linguagem visual
 * do resto do app) sobre um selo com gradiente na cor da categoria.
 */
function categoriaTipo(categoriaNome: string): 'pizza' | 'esfirra' | 'bebida' | 'generico' {
  const c = categoriaNome.toLowerCase();
  if (c.includes('pizza')) return 'pizza';
  if (c.includes('esfirra') || c.includes('combo')) return 'esfirra';
  if (c.includes('bebida')) return 'bebida';
  return 'generico';
}

const TIPO_STYLE = {
  pizza: { grad: 'from-essenza-terracotta to-[#F26522]', Icon: Pizza },
  esfirra: { grad: 'from-amber-500 to-essenza-terracotta', Icon: Croissant },
  bebida: { grad: 'from-sky-500 to-blue-600', Icon: CupSoda },
  generico: { grad: 'from-essenza-terracotta to-essenza-red-dark', Icon: Flame },
} as const;

/**
 * `foto` só é usada para categorias sem ícone padrão definido (ex: combos avulsos
 * com nome fora do padrão). Para pizza/esfirra/bebida o ícone é sempre o mesmo,
 * de propósito — mantém o cardápio visualmente uniforme em vez de uma mistura de
 * fotos de qualidade/estilo diferentes.
 */
export function ProductPlaceholder({ categoriaNome, className = '', iconClassName = '' }: { categoriaNome: string; className?: string; iconClassName?: string }) {
  const tipo = categoriaTipo(categoriaNome || '');
  const { grad, Icon } = TIPO_STYLE[tipo];
  return (
    <div className={`bg-gradient-to-br ${grad} flex items-center justify-center ${className}`}>
      <Icon className={`text-white w-1/2 h-1/2 ${iconClassName}`} strokeWidth={1.75} />
    </div>
  );
}

export function usaImagemPadrao(categoriaNome: string): boolean {
  return categoriaTipo(categoriaNome || '') !== 'generico';
}
