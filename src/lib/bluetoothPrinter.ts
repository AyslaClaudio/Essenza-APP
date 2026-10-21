/**
 * Impressão direta via Web Bluetooth (impressoras térmicas 58mm/80mm BLE).
 *
 * Aviso importante: o navegador só consegue falar com impressoras Bluetooth Low
 * Energy (BLE) via GATT. Muita impressora "portátil 58mm Android" barata usa
 * Bluetooth clássico (perfil SPP), que nenhum navegador consegue acessar — só um
 * app nativo Android. Por isso a conexão pode falhar mesmo com o Bluetooth do
 * celular/PC pareado normalmente; nesse caso a única saída é um app dedicado.
 *
 * UUIDs abaixo cobrem os módulos BLE mais comuns usados em impressoras térmicas
 * genéricas vendidas em marketplaces (não é um padrão único da indústria).
 */

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // comum em impressoras térmicas BLE genéricas
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // módulos BLE tipo HM-10/JDY, usados por vários clones
  '0000ff00-0000-1000-8000-00805f9b34fb', // outro padrão visto em impressoras "cat printer"
];

let device: BluetoothDevice | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
let reconexaoEmAndamento: Promise<boolean> | null = null;
const listenersStatus = new Set<() => void>();
const ULTIMA_IMPRESSORA_KEY = 'essenza.ultima-impressora-bluetooth';

function avisarStatus() {
  listenersStatus.forEach((listener) => listener());
}

export function observarStatusImpressora(listener: () => void): () => void {
  listenersStatus.add(listener);
  return () => listenersStatus.delete(listener);
}

export function statusImpressora(): 'conectada' | 'desconectada' | 'indisponivel' {
  if (!suportado()) return 'indisponivel';
  return impressoraConectada() ? 'conectada' : 'desconectada';
}

export function suportado(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function impressoraConectada(): boolean {
  return !!characteristic && !!device?.gatt?.connected;
}

// Diferente de impressoraConectada(): fica true mesmo se o GATT caiu por
// inatividade (comum em impressora BLE parada por um tempo, ex. só na hora
// do fechamento do dia/semana) — sinaliza que já existe um dispositivo
// pareado nesta sessão, então dá pra tentar reconectar sozinho em vez de
// exigir que o usuário clique em "Conectar Impressora" nas Configurações.
export function temImpressoraPareada(): boolean {
  return !!device;
}

export function nomeImpressora(): string | null {
  return device?.name || null;
}

function prepararDevice(novoDevice: BluetoothDevice) {
  device = novoDevice;
  try { localStorage.setItem(ULTIMA_IMPRESSORA_KEY, (novoDevice as BluetoothDevice & { id: string }).id); } catch { /* storage indisponível */ }
  device.addEventListener('gattserverdisconnected', () => {
    characteristic = null;
    avisarStatus();
  });
}

async function conectarDeviceSalvo(novoDevice: BluetoothDevice): Promise<boolean> {
  prepararDevice(novoDevice);
  try {
    const server = await novoDevice.gatt?.connect();
    if (!server) return false;
    characteristic = await descobrirCaracteristica(server);
    if (!characteristic) {
      novoDevice.gatt?.disconnect();
      return false;
    }
    avisarStatus();
    return true;
  } catch {
    characteristic = null;
    avisarStatus();
    return false;
  }
}

// Descobre e guarda a característica BLE gravável dentro de um GATT server já
// conectado. Compartilhado entre conectarImpressora() (primeiro pareamento) e
// a reconexão automática dentro de imprimirViaBluetooth().
async function descobrirCaracteristica(server: BluetoothRemoteGATTServer): Promise<BluetoothRemoteGATTCharacteristic | null> {
  for (const svcUuid of PRINTER_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(svcUuid);
      const chars = await service.getCharacteristics();
      const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (writable) return writable;
    } catch {
      // esse serviço não existe nessa impressora — tenta o próximo UUID conhecido
    }
  }
  return null;
}

export async function conectarImpressora(): Promise<{ ok: true; nome: string } | { ok: false; erro: string }> {
  if (!suportado()) {
    return { ok: false, erro: 'Este navegador não suporta Bluetooth. Use Chrome ou Edge (Android, Windows, Mac ou Linux) — não funciona no Safari/iPhone.' };
  }
  try {
    const selecionada = await navigator.bluetooth!.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });
    const ok = await conectarDeviceSalvo(selecionada);
    if (!ok) {
      return {
        ok: false,
        erro: 'Conectou no dispositivo mas não achou um canal de impressão compatível. Essa impressora provavelmente usa Bluetooth clássico (SPP), que o navegador não consegue acessar — nesse caso só dá pra imprimir por um app Android dedicado (ex: o app que veio com a impressora).',
      };
    }

    return { ok: true, nome: selecionada.name || 'Impressora Bluetooth' };
  } catch (e) {
    const err = e as Error;
    // Usuário cancelou o seletor de dispositivos — não é bem um "erro"
    if (err.name === 'NotFoundError') {
      return { ok: false, erro: 'Nenhum dispositivo selecionado.' };
    }
    return { ok: false, erro: err.message || 'Não foi possível conectar à impressora.' };
  }
}

export function desconectarImpressora() {
  device?.gatt?.disconnect();
  device = null;
  characteristic = null;
  try { localStorage.removeItem(ULTIMA_IMPRESSORA_KEY); } catch { /* storage indisponível */ }
  avisarStatus();
}

/** Reconecta a última impressora autorizada pelo Chrome, sem abrir seletor. */
export async function reconectarImpressoraSalva(): Promise<boolean> {
  if (!suportado() || impressoraConectada() || reconexaoEmAndamento) return impressoraConectada();
  reconexaoEmAndamento = (async () => {
    try {
      const bluetooth = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
      if (!bluetooth.getDevices) return false;
      const autorizadas = await bluetooth.getDevices();
      if (autorizadas.length === 0) return false;
      let idSalvo = '';
      try { idSalvo = localStorage.getItem(ULTIMA_IMPRESSORA_KEY) || ''; } catch { /* storage indisponível */ }
      const escolhida = autorizadas.find((item) => (item as BluetoothDevice & { id: string }).id === idSalvo) || autorizadas[0];
      return await conectarDeviceSalvo(escolhida);
    } catch {
      return false;
    } finally {
      reconexaoEmAndamento = null;
      avisarStatus();
    }
  })();
  return reconexaoEmAndamento;
}

// Impressoras térmicas ESC/POS trabalham com 1 byte por caractere (não UTF-8) —
// aqui é uma conversão simples (Latin-1). Acentos podem sair levemente diferentes
// dependendo da code page da impressora; é uma limitação conhecida desse tipo de
// impressora barata, não só desse app.
export function textoParaBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

// BLE clássico só garante ~20 bytes por escrita sem negociar um MTU maior
// (e o navegador não deixa a gente pedir isso) — pedaços maiores funcionam em
// parte das impressoras, mas travam ou truncam silenciosamente em outras.
// 20 bytes é o valor seguro que funciona no maior número de aparelhos.
const CHUNK_SIZE = 20;

let ultimoErro: string | null = null;

export function ultimoErroImpressao(): string | null {
  return ultimoErro;
}

export async function imprimirViaBluetooth(escposText: string | Uint8Array): Promise<boolean> {
  // Impressora BLE parada por um tempo (ex: só imprime de novo na hora do
  // fechamento do dia/semana, horas depois da última comanda) costuma cair a
  // conexão GATT sozinha. Se já pareamos com um dispositivo nesta sessão,
  // tenta reconectar automaticamente antes de desistir — sem isso o usuário
  // precisaria voltar em Configurações e clicar "Conectar" toda vez.
  if (!characteristic && device) {
    try {
      const server = device.gatt?.connected ? device.gatt : await device.gatt?.connect();
      if (server) characteristic = await descobrirCaracteristica(server);
    } catch {
      // reconexão falhou — cai no erro "nenhuma impressora conectada" abaixo
    }
  }

  if (!characteristic) {
    ultimoErro = 'Nenhuma impressora conectada.';
    return false;
  }
  ultimoErro = null;
  try {
    const bytes = typeof escposText === 'string' ? textoParaBytes(escposText) : escposText;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const slice = bytes.slice(i, i + CHUNK_SIZE);
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(slice);
      } else {
        await characteristic.writeValue(slice);
      }
    }
    return true;
  } catch (e) {
    // Nunca deixa o erro "vazar" pra quem chamou — imprimir é sempre best-effort:
    // se a impressora Bluetooth falhar no meio da impressão, quem chamou (ex:
    // lib/print.ts) precisa poder cair no fallback de impressão pelo navegador
    // em vez de travar sem imprimir nada.
    const err = e as Error;
    ultimoErro = err.message || 'Falha ao enviar dados pra impressora.';
    characteristic = null; // conexão provavelmente caiu — força reconectar da próxima vez
    return false;
  }
}
