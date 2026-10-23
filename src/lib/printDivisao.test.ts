import { describe, expect, it, vi } from 'vitest';
import { buildCashReceipt, cashHTML, printReceipt } from './print';
import type { Configuracao, Pedido } from '../types';

const pedido = { numero: 42, created_at: '2026-10-23T20:00:00Z', total: 60, subtotal: 60, taxa_entrega: 0, desconto: 0, forma_pagamento: 'Dividido', itens: [] } as unknown as Pedido;
const config = { nome_loja: 'Essenza' } as Configuracao;
const pagamentos = [
  { identificacao: 'Ana', valor: 20, forma_pagamento: 'Pix' },
  { identificacao: 'João', valor: 40, forma_pagamento: 'Dinheiro' },
];
const mocks = vi.hoisted(() => ({ carregar: vi.fn(), enviar: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: mocks.carregar }) }) }) }) } }));
vi.mock('./bluetoothPrinter', () => ({
  impressoraConectada: () => true, imprimirViaBluetooth: mocks.enviar,
  textoParaBytes: (texto: string) => texto, ultimoErroImpressao: () => '',
}));

describe('divisão na comanda do caixa', () => {
  it('consulta a divisão salva antes de enviar para a impressora', async () => {
    mocks.carregar.mockResolvedValue({ data: pagamentos, error: null });
    mocks.enviar.mockResolvedValue(true);
    expect(await printReceipt(pedido, config, 'caixa')).toBe('bluetooth');
    expect(mocks.enviar).toHaveBeenLastCalledWith(expect.stringContaining('DIVISAO DA CONTA'));
    expect(mocks.enviar).toHaveBeenLastCalledWith(expect.stringContaining('Ana'));
  });
  it('não imprime uma divisão incompleta quando a consulta falha', async () => {
    mocks.carregar.mockResolvedValue({ data: null, error: { message: 'offline' } });
    mocks.enviar.mockClear();
    await expect(printReceipt(pedido, config, 'caixa')).rejects.toThrow('Não foi possível carregar');
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it.each([buildCashReceipt, cashHTML])('mostra nome, valor e forma de cada pagamento', (render) => {
    const texto = render(pedido, config, pagamentos);
    expect(texto).toContain('DIVISAO DA CONTA');
    expect(texto).toContain('Ana');
    expect(texto).toContain('20,00');
    expect(texto).toContain('João');
    expect(texto).toContain('40,00');
    expect(texto).toContain('Pix');
    expect(texto).toContain('Dinheiro');
  });
  it('mantém a comanda sem seção de divisão para pedidos sem pagamentos divididos', () => {
    expect(buildCashReceipt(pedido, config)).not.toContain('DIVISAO DA CONTA');
    expect(cashHTML(pedido, config)).not.toContain('DIVISAO DA CONTA');
  });
  it('escapa nomes no HTML e remove comandos de controle no Bluetooth', () => {
    const partes = [{ identificacao: '<Ana>\x1b', valor: 60, forma_pagamento: 'Pix' }];
    expect(cashHTML(pedido, config, partes)).toContain('&lt;Ana&gt;');
    expect(buildCashReceipt(pedido, config, partes)).not.toContain('<Ana>\x1b');
  });
});
