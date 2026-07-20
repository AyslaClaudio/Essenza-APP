export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function lucroProduto(custo: number, preco: number): number {
  return preco - custo;
}

export function margemProduto(custo: number, preco: number): number {
  if (preco <= 0) return 0;
  return ((preco - custo) / preco) * 100;
}

export function fmtData(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtHora(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isToday(d: string): boolean {
  return new Date(d).toDateString() === new Date().toDateString();
}
