import type { Pedido, ItemPedido, Configuracao } from '../types';
import { brl, fmtHora } from './format';

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

export function buildKitchenReceipt(pedido: Pedido, config: Configuracao): string {
  const lines: string[] = [];
  lines.push(CENTER + BOLD_ON + (config.nome_loja || 'ESSENZA') + BOLD_OFF);
  lines.push(CENTER + 'COZINHA');
  lines.push('');
  lines.push(LEFT + `Pedido #: ${pedido.numero}`);
  lines.push(`Hora: ${fmtHora(pedido.created_at)}`);
  lines.push(`Tipo: ${pedido.tipo.toUpperCase()}`);
  if (pedido.cliente_nome) lines.push(`Cliente: ${pedido.cliente_nome}`);
  lines.push(LINE);

  pedido.itens?.forEach((item: ItemPedido) => {
    lines.push(BOLD_ON + `${item.quantidade}x ${item.produto_nome}` + BOLD_OFF);
    if (item.sabor1 || item.sabor2) {
      const sabores = [item.sabor1, item.sabor2].filter(Boolean).join(' / ');
      lines.push(BOLD_ON + `  Sabores: ${sabores}` + BOLD_OFF);
    }
    if (item.adicional) {
      lines.push(BOLD_ON + `  Adic: ${item.adicional}` + BOLD_OFF);
    }
    if (item.observacao) {
      lines.push(BOLD_ON + `  Obs: ${item.observacao.toUpperCase()}` + BOLD_OFF);
    }
  });

  lines.push(LINE);
  if (pedido.observacao) {
    lines.push(BOLD_ON + `OBS GERAL: ${pedido.observacao.toUpperCase()}` + BOLD_OFF);
  }
  return INIT + lines.join('\n') + '\n\n\n';
}

export function buildCashReceipt(pedido: Pedido, config: Configuracao): string {
  const lines: string[] = [];
  lines.push(CENTER + BOLD_ON + (config.nome_loja || 'ESSENZA') + BOLD_OFF);
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
    if (item.sabor1 || item.sabor2) {
      const sabores = [item.sabor1, item.sabor2].filter(Boolean).join(' / ');
      lines.push(`  ${sabores}`);
    }
    if (item.adicional) lines.push(`  + ${item.adicional}`);
    if (item.observacao) lines.push(`  Obs: ${item.observacao}`);
    lines.push(`  ${brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}`);
  });

  lines.push(LINE);
  lines.push(`Subtotal:    ${brl(pedido.subtotal)}`);
  if (pedido.taxa_entrega > 0) lines.push(`Taxa Entrega: ${brl(pedido.taxa_entrega)}`);
  if (pedido.desconto > 0) lines.push(`Desconto:    -${brl(pedido.desconto)}`);
  lines.push(BOLD_ON + `TOTAL:       ${brl(pedido.total)}` + BOLD_OFF);
  lines.push(`Pagamento:   ${pedido.forma_pagamento || '-'}`);
  lines.push(LINE);
  lines.push(CENTER + 'Obrigado! Volte Sempre');
  lines.push(CENTER + 'ESSENZA Pizzaria');
  return INIT + lines.join('\n') + '\n\n\n';
}

/**
 * Renders an HTML receipt for browser-based printing.
 * Uses CSS to style as 80mm thermal receipt.
 */
export function printReceipt(pedido: Pedido, config: Configuracao, via: 'cozinha' | 'caixa') {
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

function kitchenHTML(pedido: Pedido, config: Configuracao): string {
  let itens = '';
  pedido.itens?.forEach((item) => {
    itens += `<div class="item"><b>${item.quantidade}x ${item.produto_nome}</b></div>`;
    if (item.sabor1 || item.sabor2) {
      const s = [item.sabor1, item.sabor2].filter(Boolean).join(' / ');
      itens += `<div class="sub"><b>Sabores: ${s}</b></div>`;
    }
    if (item.adicional) itens += `<div class="sub"><b>Adic: ${item.adicional}</b></div>`;
    if (item.observacao) itens += `<div class="sub"><b>Obs: ${item.observacao.toUpperCase()}</b></div>`;
  });
  return `
    <div class="center"><b>${config.nome_loja || 'ESSENZA'}</b></div>
    <div class="center">*** COZINHA ***</div>
    <div>Pedido #: ${pedido.numero}</div>
    <div>Hora: ${fmtHora(pedido.created_at)}</div>
    <div>Tipo: ${pedido.tipo.toUpperCase()}</div>
    ${pedido.cliente_nome ? `<div>Cliente: ${pedido.cliente_nome}</div>` : ''}
    <div class="sep">--------------------------------</div>
    ${itens}
    <div class="sep">--------------------------------</div>
    ${pedido.observacao ? `<div><b>OBS: ${pedido.observacao.toUpperCase()}</b></div>` : ''}
  `;
}

function cashHTML(pedido: Pedido, config: Configuracao): string {
  let itens = '';
  pedido.itens?.forEach((item) => {
    itens += `<div class="item">${item.quantidade}x ${item.produto_nome}</div>`;
    if (item.sabor1 || item.sabor2) {
      const s = [item.sabor1, item.sabor2].filter(Boolean).join(' / ');
      itens += `<div class="sub">${s}</div>`;
    }
    if (item.adicional) itens += `<div class="sub">+ ${item.adicional}</div>`;
    if (item.observacao) itens += `<div class="sub">Obs: ${item.observacao}</div>`;
    itens += `<div class="right">${brl(item.quantidade * (item.preco_unitario + item.adicional_preco))}</div>`;
  });
  return `
    <div class="center"><b>${config.nome_loja || 'ESSENZA'}</b></div>
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
    <div class="center">ESSENZA Pizzaria</div>
  `;
}
