import { afterEach, describe, expect, it, vi } from 'vitest';

async function impressoraTeste(travar = false) {
  vi.resetModules();
  const envios: number[][] = [];
  const canal = {
    properties: { write: true, writeWithoutResponse: true },
    writeValue: vi.fn((bytes: Uint8Array) => {
      envios.push([...bytes]);
      return travar ? new Promise<void>(() => {}) : Promise.resolve();
    }),
    writeValueWithoutResponse: vi.fn(),
  };
  const gatt = { connected: true, connect: vi.fn(), disconnect: vi.fn(), getPrimaryService: vi.fn(async () => ({ getCharacteristics: async () => [canal] })) };
  gatt.connect.mockResolvedValue(gatt);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => ({ id: 'teste', name: 'Térmica', gatt, addEventListener: vi.fn() }) } });
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  const modulo = await import('./bluetoothPrinter');
  expect((await modulo.conectarImpressora()).ok).toBe(true);
  return { modulo, canal, gatt, envios };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('transporte Bluetooth das comandas', () => {
  it('envia uma comanda inteira antes da seguinte e usa confirmação quando disponível', async () => {
    vi.useFakeTimers();
    const { modulo, canal, envios } = await impressoraTeste();
    const primeira = modulo.imprimirViaBluetooth(new Uint8Array(40).fill(1));
    const segunda = modulo.imprimirViaBluetooth(new Uint8Array(20).fill(2));
    await vi.runAllTimersAsync();
    expect(await primeira).toBe(true);
    expect(await segunda).toBe(true);
    expect(envios.map((bytes) => bytes[0])).toEqual([1, 1, 2]);
    expect(canal.writeValueWithoutResponse).not.toHaveBeenCalled();
  });
  it('encerra o envio travado com erro e desconecta o canal', async () => {
    vi.useFakeTimers();
    const { modulo, gatt } = await impressoraTeste(true);
    const envio = modulo.imprimirViaBluetooth('TESTE');
    await vi.runAllTimersAsync();
    expect(await envio).toBe(false);
    expect(modulo.ultimoErroImpressao()).toContain('parou de responder');
    expect(gatt.disconnect).toHaveBeenCalled();
  });
});
