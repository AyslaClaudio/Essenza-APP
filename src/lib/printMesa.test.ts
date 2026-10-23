import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printMesaComanda } from './print';
import { impressoraConectada, imprimirViaBluetooth } from './bluetoothPrinter';
import type { Configuracao, ItemMesa } from '../types';

vi.mock('./bluetoothPrinter', () => ({
  impressoraConectada: vi.fn(), imprimirViaBluetooth: vi.fn(),
  textoParaBytes: () => new Uint8Array([27, 64]), ultimoErroImpressao: () => 'Conexão perdida',
}));
const config = { nome_loja: 'Essenza' } as Configuracao;
const itens = [{ id: '1', produto_nome: 'Pizza G Mussarela', quantidade: 1 }] as ItemMesa[];
let recibo: { id: string; className: string; innerHTML: string; remove: ReturnType<typeof vi.fn> };
let janela: EventTarget & { print: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(impressoraConectada).mockReturnValue(false);
  vi.mocked(imprimirViaBluetooth).mockReset();
  recibo = { id: '', className: '', innerHTML: '', remove: vi.fn() };
  janela = Object.assign(new EventTarget(), { print: vi.fn() });
  vi.stubGlobal('window', janela);
  vi.stubGlobal('document', { getElementById: () => null, createElement: () => recibo, body: { appendChild: vi.fn() } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('impressão do lançamento', () => {
  it('abre o navegador diretamente e conserva o recibo até o fim da impressão', async () => {
    const envio = printMesaComanda(4, itens, config, 'navegador');
    expect(janela.print).toHaveBeenCalledOnce();
    expect(await envio).toBe('navegador');
    expect(recibo.innerHTML).toContain('MESA 4');
    expect(recibo.innerHTML).toContain('Pizza G Mussarela');
    vi.advanceTimersByTime(1500);
    expect(recibo.remove).not.toHaveBeenCalled();
    janela.dispatchEvent(new Event('afterprint'));
    expect(recibo.remove).toHaveBeenCalledOnce();
  });
  it('não tenta abrir um diálogo fora do clique após falhar no Bluetooth', async () => {
    vi.mocked(impressoraConectada).mockReturnValue(true);
    vi.mocked(imprimirViaBluetooth).mockResolvedValue(false);
    await expect(printMesaComanda(4, itens, config, 'bluetooth')).rejects.toThrow('Conexão perdida');
    expect(janela.print).not.toHaveBeenCalled();
  });
  it('usa o navegador escolhido mesmo se existir Bluetooth conectado', async () => {
    vi.mocked(impressoraConectada).mockReturnValue(true);
    await printMesaComanda(4, itens, config, 'navegador');
    expect(imprimirViaBluetooth).not.toHaveBeenCalled();
    expect(janela.print).toHaveBeenCalledOnce();
  });
});
