import type { Pedido, ItemPedido, Configuracao, ItemMesa } from '../types';
import { brl, fmtHora } from './format';
import { temImpressoraPareada, imprimirViaBluetooth } from './bluetoothPrinter';

/**
 * ESC/POS commands for 80mm thermal printers.
 * Builds the raw receipt bytes for direct printing via WebUSB/WebHID or
 * renders an HTML version for browser printing.
 */

const ESC = '\x1B';
const INIT = `${ESC}@`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const CENTER = `${ESC}a\x01`;
const LEFT = `${ESC}a\x00`;
const LINE = '--------------------------------';

// Marca d'água leve no topo de cada recibo — só texto (funciona em qualquer
// impressora térmica/Bluetooth, sem gastar tinta com uma imagem). Aprovada
// pela usuária: faixa de 3 marcas (lembrando a faixa verde/branco/vermelho
// da logo oficial) + nome da loja + "Pizzaria".
function marcaEscPos(nomeLoja: string): string {
  return [
    CENTER + '*  *  *',
    CENTER + BOLD_ON + (nomeLoja || 'ESSENZA') + BOLD_OFF,
    CENTER + 'PIZZARIA',
  ].join('\n');
}

function marcaHtml(nomeLoja: string): string {
  return `
    <div class="marca">
      <div class="center">* &nbsp; * &nbsp; *</div>
      <div class="center"><b>${nomeLoja || 'ESSENZA'}</b></div>
      <div class="center">PIZZARIA</div>
    </div>
  `;
}

export interface FechamentoProduto {
  nome: string;
  qtd: number;
  lucro: number;
}

/**
 * Fechamento do dia / relatório de caixa — mesma lógica de impressão dos
 * pedidos (Bluetooth primeiro, HTML como reserva) pra imprimir na mesma
 * impressora térmica em vez de só abrir o diálogo do navegador.
 */
export async function printFechamentoDia(
  dataLabel: string,
  faturamento: number,
  custoTotal: number,
  lucroBruto: number,
  despesasFixas: number,
  lucroLiquido: number,
  produtos: FechamentoProduto[],
  config: Configuracao,
) {
  if (temImpressoraPareada()) {
    const lines: string[] = [];
    lines.push(marcaEscPos(config.nome_loja));
    lines.push(CENTER + BOLD_ON + 'FECHAMENTO DO DIA' + BOLD_OFF);
    lines.push(CENTER + dataLabel);
    lines.push(LINE);
    lines.push(LEFT + `Faturamento:     ${brl(faturamento)}`);
    lines.push(`Custo Produtos:  ${brl(custoTotal)}`);
    lines.push(`Lucro Bruto:     ${brl(lucroBruto)}`);
    lines.push(`Despesas Fixas:  ${brl(despesasFixas)}`);
    lines.push(BOLD_ON + `LUCRO LIQUIDO:   ${brl(lucroLiquido)}` + BOLD_OFF);
    lines.push(LINE);
    lines.push(BOLD_ON + 'POR PRODUTO' + BOLD_OFF);
    produtos.forEach((p) => lines.push(`${p.qtd}x ${p.nome} - Lucro: ${brl(p.lucro)}`));
    lines.push(LINE);
    lines.push(marcaEscPos(config.nome_loja));
    const ok = await imprimirViaBluetooth(INIT + lines.join('\n') + '\n\n\n');
    if (ok) return;
  }

  const existing = document.getElementById('print-area');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'print-area';
  div.className = 'print-receipt';
  let linhas = '';
  produtos.forEach((p) => { linhas += `<div>${p.qtd}x ${p.nome} - Lucro: ${brl(p.lucro)}</div>`; });
  div.innerHTML = `
    ${marcaHtml(config.nome_loja)}
    <div class="center"><b>FECHAMENTO DO DIA</b></div>
    <div class="center">${dataLabel}</div>
    <div class="sep">--------------------------------</div>
    <div>Faturamento: ${brl(faturamento)}</div>
    <div>Custo Produtos: ${brl(custoTotal)}</div>
    <div>Lucro Bruto: ${brl(lucroBruto)}</div>
    <div>Despesas Fixas: ${brl(despesasFixas)}</div>
    <div class="total">LUCRO LIQUIDO: ${brl(lucroLiquido)}</div>
    <div class="sep">--------------------------------</div>
    <div><b>POR PRODUTO</b></div>
    ${linhas}
    <div class="sep">--------------------------------</div>
    ${marcaHtml(config.nome_loja)}
  `;
  document.body.appendChild(div);
  window.print();
  setTimeout(() => div.remove(), 1000);
}

export function buildKitchenReceipt(pedido: Pedido, config: Configuracao): string {
  const lines: string[] = [];
  lines.push(marcaEscPos(config.nome_loja));
  lines.push(CENTER + 'COZINHA');
  lines.push('');
  lines.push(LEFT + `Pedido #: ${pedido.numero}`);
  lines.push(`Hora: ${fmtHora(pedido.created_at)}`);
  lines.push(`Tipo: ${pedido.tipo.toUpperCase()}`);
  if (pedido.cliente_nome) lines.push(`Cliente: ${pedido.cliente_nome}`);
  lines.push(LINE);

  pedido.itens?.forEach((item: ItemPedido) => {
    lines.push(BOLD_ON + `${item.quantidade}x ${item.produto_nome}` + BOLD_OFF);
    if (item.adicional) {
      lines.push(BOLD_ON + `  Adic: ${item.adicional}` + BOLD_OFF);
    }
    if (item.observacao) {
      lines.push(BOLD_ON + `  Obs: ${item.observacao.toUpperCase()}` + BOLD_OFF);
    }
    lines.push('');
  });

  lines.push(LINE);
  if (pedido.observacao) {
    lines.push(BOLD_ON + `OBS GERAL: ${pedido.observacao.toUpperCase()}` + BOLD_OFF);
  }
  lines.push(LINE);
  lines.push(marcaEscPos(config.nome_loja));
  return INIT + lines.join('\n') + '\n\n\n';
}

export function buildCashReceipt(pedido: Pedido, config: Configuracao): string {
  const lines: string[] = [];
  lines.push(marcaEscPos(config.nome_loja));
  if (config.endereco_loja) lines.push(CENTER + config.endereco_loja);
  if (config.telefone_loja) lines.push(CENTER + `Tel: ${config.telefone_loja}`);
  lines.push(LINE);
  lines.push(`Pedido #: ${pedido.numero}`);
  lines.push(`Data: ${fmtHora(pedido.created_at)}`);
  if (pedido.cliente_nome) lines.push(`Cliente: ${pedido.cliente_nome}`);
  if (pedido.cliente_telefone) lines.push(`Tel: ${pedido.cliente_telefone}`);
  if (pedido.cliente_endereco) lines.push(`End: ${pedido.cliente_endereco}`);
  if (pedido.cliente_bairro) lines.push(`Bairro: ${pedido.cliente_bairro}`);
  lines.push(LINE);

  pedido.itens?.forEach((item: ItemPedido) => {
    lines.push(`${item.quantidade}x ${item.produto_nome}`);
    if (item.adicional) lines.push(`  + ${item.adicional}`);
    if (item.observacao) lines.push(`  Obs: ${item.observacao}`);
    lines.push(`  ${brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}`);
    lines.push('');
  });

  lines.push(LINE);
  lines.push(`Subtotal:    ${brl(pedido.subtotal)}`);
  if (pedido.taxa_entrega > 0) lines.push(`Taxa Entrega: ${brl(pedido.taxa_entrega)}`);
  if (pedido.desconto > 0) lines.push(`Desconto:    -${brl(pedido.desconto)}`);
  lines.push(BOLD_ON + `TOTAL:       ${brl(pedido.total)}` + BOLD_OFF);
  lines.push(`Pagamento:   ${pedido.forma_pagamento || '-'}`);
  lines.push(LINE);
  lines.push(CENTER + 'Obrigado! Volte Sempre');
  lines.push(LINE);
  lines.push(marcaEscPos(config.nome_loja));
  return INIT + lines.join('\n') + '\n\n\n';
}

/**
 * Renders an HTML receipt for browser-based printing.
 * Uses CSS to style as 80mm thermal receipt.
 *
 * Se houver uma impressora Bluetooth conectada (Configurações > Impressoras),
 * imprime direto nela via ESC/POS em vez de abrir o diálogo de impressão do
 * navegador — mais rápido e sem depender de driver/spooler do sistema.
 */
export async function printReceipt(pedido: Pedido, config: Configuracao, via: 'cozinha' | 'caixa') {
  if (temImpressoraPareada()) {
    const texto = via === 'cozinha' ? buildKitchenReceipt(pedido, config) : buildCashReceipt(pedido, config);
    const ok = await imprimirViaBluetooth(texto);
    if (ok) return;
  }

  const existing = document.getElementById('print-area');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'print-area';
  div.className = 'print-receipt';

  if (via === 'cozinha') {
    div.innerHTML = kitchenHTML(pedido, config);
  } else {
    div.innerHTML = cashHTML(pedido, config);
  }

  document.body.appendChild(div);
  window.print();
  setTimeout(() => div.remove(), 1000);
}

/**
 * Comanda de cozinha para a MESA — impressa quando novos itens são lançados na mesa.
 * Diferente do pedido de delivery/balcão, uma mesa manda várias comandas ao longo da
 * refeição (uma a cada rodada de itens). `itens` aqui são apenas os itens recém-lançados.
 */
function buildMesaComandaEscPos(numeroMesa: number, itens: ItemMesa[], config: Configuracao): string {
  const lines: string[] = [];
  lines.push(marcaEscPos(config.nome_loja));
  lines.push(CENTER + '*** COZINHA ***');
  lines.push(CENTER + BOLD_ON + `MESA ${numeroMesa}` + BOLD_OFF);
  lines.push(LEFT + `Hora: ${fmtHora(new Date().toISOString())}`);
  lines.push(LINE);
  itens.forEach((item) => {
    lines.push(BOLD_ON + `${item.quantidade}x ${item.produto_nome}` + BOLD_OFF);
    if (item.adicional) lines.push(BOLD_ON + `  Adic: ${item.adicional}` + BOLD_OFF);
    if (item.observacao) lines.push(BOLD_ON + `  Obs: ${item.observacao.toUpperCase()}` + BOLD_OFF);
    lines.push('');
  });
  lines.push(LINE);
  lines.push(marcaEscPos(config.nome_loja));
  return INIT + lines.join('\n') + '\n\n\n';
}

export async function printMesaComanda(numeroMesa: number, itens: ItemMesa[], config: Configuracao) {
  if (temImpressoraPareada()) {
    const ok = await imprimirViaBluetooth(buildMesaComandaEscPos(numeroMesa, itens, config));
    if (ok) return;
  }

  const existing = document.getElementById('print-area');
  if (existing) existing.remove();

  let itensHTML = '';
  itens.forEach((item) => {
    itensHTML += `<div class="item"><b>${item.quantidade}x ${item.produto_nome}</b></div>`;
    if (item.adicional) itensHTML += `<div class="sub"><b>Adic: ${item.adicional}</b></div>`;
    if (item.observacao) itensHTML += `<div class="sub"><b>Obs: ${item.observacao.toUpperCase()}</b></div>`;
  });

  const div = document.createElement('div');
  div.id = 'print-area';
  div.className = 'print-receipt';
  div.innerHTML = `
    ${marcaHtml(config.nome_loja)}
    <div class="center">*** COZINHA ***</div>
    <div class="center"><b>MESA ${numeroMesa}</b></div>
    <div>Hora: ${fmtHora(new Date().toISOString())}</div>
    <div class="sep">--------------------------------</div>
    ${itensHTML}
    <div class="sep">--------------------------------</div>
    ${marcaHtml(config.nome_loja)}
  `;
  document.body.appendChild(div);
  window.print();
  setTimeout(() => div.remove(), 1000);
}

/**
 * Conta (extrato) da MESA — impressa no fechamento, com todos os itens acumulados.
 */
function buildMesaContaEscPos(numeroMesa: number, itens: ItemMesa[], total: number, formaPagamento: string, config: Configuracao): string {
  const lines: string[] = [];
  lines.push(marcaEscPos(config.nome_loja));
  if (config.endereco_loja) lines.push(CENTER + config.endereco_loja);
  if (config.telefone_loja) lines.push(CENTER + `Tel: ${config.telefone_loja}`);
  lines.push(LINE);
  lines.push(CENTER + BOLD_ON + `CONTA DA MESA ${numeroMesa}` + BOLD_OFF);
  lines.push(LEFT + `Data: ${fmtHora(new Date().toISOString())}`);
  lines.push(LINE);
  itens.forEach((item) => {
    lines.push(`${item.quantidade}x ${item.produto_nome}`);
    if (item.adicional) lines.push(`  + ${item.adicional}`);
    if (item.observacao) lines.push(`  Obs: ${item.observacao}`);
    lines.push(`  ${brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}`);
    lines.push('');
  });
  lines.push(LINE);
  lines.push(BOLD_ON + `TOTAL:       ${brl(total)}` + BOLD_OFF);
  lines.push(`Pagamento:   ${formaPagamento || '-'}`);
  lines.push(LINE);
  lines.push(CENTER + 'Obrigado! Volte Sempre');
  lines.push(LINE);
  lines.push(marcaEscPos(config.nome_loja));
  return INIT + lines.join('\n') + '\n\n\n';
}

export async function printMesaConta(
  numeroMesa: number,
  itens: ItemMesa[],
  total: number,
  formaPagamento: string,
  config: Configuracao,
) {
  if (temImpressoraPareada()) {
    const ok = await imprimirViaBluetooth(buildMesaContaEscPos(numeroMesa, itens, total, formaPagamento, config));
    if (ok) return;
  }

  const existing = document.getElementById('print-area');
  if (existing) existing.remove();

  let itensHTML = '';
  itens.forEach((item) => {
    itensHTML += `<div class="item">${item.quantidade}x ${item.produto_nome}</div>`;
    if (item.adicional) itensHTML += `<div class="sub">+ ${item.adicional}</div>`;
    if (item.observacao) itensHTML += `<div class="sub">Obs: ${item.observacao}</div>`;
    itensHTML += `<div class="right">${brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}</div>`;
  });

  const div = document.createElement('div');
  div.id = 'print-area';
  div.className = 'print-receipt';
  div.innerHTML = `
    ${marcaHtml(config.nome_loja)}
    ${config.endereco_loja ? `<div class="center">${config.endereco_loja}</div>` : ''}
    ${config.telefone_loja ? `<div class="center">Tel: ${config.telefone_loja}</div>` : ''}
    <div class="sep">--------------------------------</div>
    <div class="center"><b>CONTA DA MESA ${numeroMesa}</b></div>
    <div>Data: ${fmtHora(new Date().toISOString())}</div>
    <div class="sep">--------------------------------</div>
    ${itensHTML}
    <div class="sep">--------------------------------</div>
    <div class="total">TOTAL:       ${brl(total)}</div>
    <div>Pagamento:   ${formaPagamento || '-'}</div>
    <div class="sep">--------------------------------</div>
    <div class="center">Obrigado! Volte Sempre</div>
    <div class="sep">--------------------------------</div>
    ${marcaHtml(config.nome_loja)}
  `;
  document.body.appendChild(div);
  window.print();
  setTimeout(() => div.remove(), 1000);
}

function kitchenHTML(pedido: Pedido, config: Configuracao): string {
  let itens = '';
  pedido.itens?.forEach((item) => {
    itens += `<div class="item"><b>${item.quantidade}x ${item.produto_nome}</b></div>`;
    if (item.adicional) itens += `<div class="sub"><b>Adic: ${item.adicional}</b></div>`;
    if (item.observacao) itens += `<div class="sub"><b>Obs: ${item.observacao.toUpperCase()}</b></div>`;
  });
  return `
    ${marcaHtml(config.nome_loja)}
    <div class="center">*** COZINHA ***</div>
    <div>Pedido #: ${pedido.numero}</div>
    <div>Hora: ${fmtHora(pedido.created_at)}</div>
    <div>Tipo: ${pedido.tipo.toUpperCase()}</div>
    ${pedido.cliente_nome ? `<div>Cliente: ${pedido.cliente_nome}</div>` : ''}
    <div class="sep">--------------------------------</div>
    ${itens}
    <div class="sep">--------------------------------</div>
    ${pedido.observacao ? `<div><b>OBS: ${pedido.observacao.toUpperCase()}</b></div>` : ''}
    <div class="sep">--------------------------------</div>
    ${marcaHtml(config.nome_loja)}
  `;
}

function cashHTML(pedido: Pedido, config: Configuracao): string {
  let itens = '';
  pedido.itens?.forEach((item) => {
    itens += `<div class="item">${item.quantidade}x ${item.produto_nome}</div>`;
    if (item.adicional) itens += `<div class="sub">+ ${item.adicional}</div>`;
    if (item.observacao) itens += `<div class="sub">Obs: ${item.observacao}</div>`;
    itens += `<div class="right">${brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}</div>`;
  });
  return `
    ${marcaHtml(config.nome_loja)}
    ${config.endereco_loja ? `<div class="center">${config.endereco_loja}</div>` : ''}
    ${config.telefone_loja ? `<div class="center">Tel: ${config.telefone_loja}</div>` : ''}
    <div class="sep">--------------------------------</div>
    <div>Pedido #: ${pedido.numero}</div>
    <div>Data: ${fmtHora(pedido.created_at)}</div>
    ${pedido.cliente_nome ? `<div>Cliente: ${pedido.cliente_nome}</div>` : ''}
    ${pedido.cliente_telefone ? `<div>Tel: ${pedido.cliente_telefone}</div>` : ''}
    ${pedido.cliente_endereco ? `<div>End: ${pedido.cliente_endereco}</div>` : ''}
    ${pedido.cliente_bairro ? `<div>Bairro: ${pedido.cliente_bairro}</div>` : ''}
    <div class="sep">--------------------------------</div>
    ${itens}
    <div class="sep">--------------------------------</div>
    <div>Subtotal:    ${brl(pedido.subtotal)}</div>
    ${pedido.taxa_entrega > 0 ? `<div>Taxa Entrega: ${brl(pedido.taxa_entrega)}</div>` : ''}
    ${pedido.desconto > 0 ? `<div>Desconto:    -${brl(pedido.desconto)}</div>` : ''}
    <div class="total">TOTAL:       ${brl(pedido.total)}</div>
    <div>Pagamento:   ${pedido.forma_pagamento || '-'}</div>
    <div class="sep">--------------------------------</div>
    <div class="center">Obrigado! Volte Sempre</div>
    <div class="sep">--------------------------------</div>
    ${marcaHtml(config.nome_loja)}
  `;
}
