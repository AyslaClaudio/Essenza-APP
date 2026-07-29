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

export function suportado(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function impressoraConectada(): boolean {
  return !!characteristic && !!device?.gatt?.connected;
}

export function nomeImpressora(): string | null {
  return device?.name || null;
}

export async function conectarImpressora(): Promise<{ ok: true; nome: string } | { ok: false; erro: string }> {
  if (!suportado()) {
    return { ok: false, erro: 'Este navegador não suporta Bluetooth. Use Chrome ou Edge (Android, Windows, Mac ou Linux) — não funciona no Safari/iPhone.' };
  }
  try {
    device = await navigator.bluetooth!.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICE_UUIDS,
    });
    const server = await device.gatt?.connect();
    if (!server) throw new Error('Não foi possível abrir conexão GATT com o dispositivo.');

    characteristic = null;
    for (const svcUuid of PRINTER_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(svcUuid);
        const chars = await service.getCharacteristics();
        const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (writable) { characteristic = writable; break; }
      } catch {
        // esse serviço não existe nessa impressora — tenta o próximo UUID conhecido
      }
    }

    if (!characteristic) {
      device.gatt?.disconnect();
      return {
        ok: false,
        erro: 'Conectou no dispositivo mas não achou um canal de impressão compatível. Essa impressora provavelmente usa Bluetooth clássico (SPP), que o navegador não consegue acessar — nesse caso só dá pra imprimir por um app Android dedicado (ex: o app que veio com a impressora).',
      };
    }

    device.addEventListener('gattserverdisconnected', () => {
      characteristic = null;
    });

    return { ok: true, nome: device.name || 'Impressora Bluetooth' };
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
}

// Impressoras térmicas ESC/POS trabalham com 1 byte por caractere (não UTF-8) —
// aqui é uma conversão simples (Latin-1). Acentos podem sair levemente diferentes
// dependendo da code page da impressora; é uma limitação conhecida desse tipo de
// impressora barata, não só desse app.
function textoParaBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

// BLE limita o tamanho de cada escrita (varia por dispositivo/SO) — manda em
// pedaços pequenos pra funcionar no maior número de impressoras possível.
const CHUNK_SIZE = 180;

export async function imprimirViaBluetooth(escposText: string): Promise<boolean> {
  if (!characteristic) return false;
  const bytes = textoParaBytes(escposText);
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.slice(i, i + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(slice);
    } else {
      await characteristic.writeValue(slice);
    }
  }
  return true;
}
