// ============================================================================
// Serviço de relatórios automáticos no WhatsApp (ESSENZA)
//
// Reaproveita a MESMA conexão Baileys já ativa do robô (o `sock`) e o mesmo
// cliente Supabase. Não usa a WhatsApp Business API oficial — envia pelo número
// real que já está conectado ao bot.
//
// Os números (faturamento, lucro, custo, margem) vêm diretamente do banco: o app
// grava custo_total e lucro em cada pedido (a "Tabela v12" da operação).
// ============================================================================

// Formata valor em Reais
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Início/fim de um dia
const startDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ddmm = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Busca os pedidos (não cancelados) num intervalo e devolve os agregados.
 */
async function agregarPeriodo(supabase, ini, fim) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, total, lucro, custo_total, created_at')
    .gte('created_at', ini.toISOString())
    .lte('created_at', fim.toISOString())
    .neq('status', 'cancelado');

  if (error) throw new Error(error.message);
  const pedidos = data || [];

  const faturamento = pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
  const lucro = pedidos.reduce((s, p) => s + Number(p.lucro || 0), 0);
  const custo = pedidos.reduce((s, p) => s + Number(p.custo_total || 0), 0);
  const num = pedidos.length;
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
  const ticket = num > 0 ? faturamento / num : 0;

  return { pedidos, faturamento, lucro, custo, num, margem, ticket };
}

/**
 * Sabor mais vendido no intervalo (a partir dos itens dos pedidos).
 */
async function saborCampeao(supabase, pedidoIds) {
  if (!pedidoIds.length) return null;
  const { data: itens } = await supabase
    .from('itens_pedido')
    .select('produto_nome, sabor1, sabor2, quantidade')
    .in('pedido_id', pedidoIds);

  const mapa = new Map();
  const add = (nome, q) => { if (!nome) return; mapa.set(nome, (mapa.get(nome) || 0) + q); };
  (itens || []).forEach((it) => {
    const q = Number(it.quantidade || 1);
    if (it.sabor1 && it.sabor2) { add(it.sabor1, q); add(it.sabor2, q); }
    else add(it.sabor1 || it.produto_nome, q);
  });

  const top = [...mapa.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { nome: top[0], quantidade: top[1] } : null;
}

/**
 * Gera uma frase de sugestão curta a partir dos números (heurística, sem custo de API).
 */
function insight({ margem, num, faturamento, ticket }, campeao) {
  if (num === 0) return 'Dia sem vendas registradas — vale conferir se o movimento está lento ou se houve algo no fechamento.';
  if (margem < 40) return `Margem baixa (${margem.toFixed(0)}%). Reveja custos ou preços dos itens que mais saem.`;
  if (campeao) return `${campeao.nome} foi o campeão. Garanta o estoque para não perder venda.`;
  return `Ticket médio de ${brl(ticket)}. Oferecer bebida/sobremesa no fechamento ajuda a subir esse número.`;
}

// Envia um texto pelo WhatsApp usando o socket já conectado
async function enviarTexto(sock, destinoPhone, texto) {
  const jid = `${String(destinoPhone).replace(/\D/g, '')}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: texto });
}

/**
 * RELATÓRIO DIÁRIO — resume o dia ANTERIOR (o dia que acabou de fechar).
 * Rodado normalmente às 9h da manhã.
 */
export async function enviarRelatorioDiario(sock, supabase, destinoPhone) {
  if (!destinoPhone) { console.log('⏭️  Relatório diário: OWNER_ALERT_PHONE não configurado, pulando.'); return; }
  if (!sock) { console.log('⏭️  Relatório diário: WhatsApp não conectado, pulando.'); return; }

  const ontem = addDays(new Date(), -1);
  const a = await agregarPeriodo(supabase, startDay(ontem), endDay(ontem));
  const campeao = await saborCampeao(supabase, a.pedidos.map((p) => p.id));

  const msg =
    `📊 *Relatório ESSENZA* — ${ddmm(ontem)}\n\n` +
    `💰 Faturamento: *${brl(a.faturamento)}*\n` +
    `📈 Lucro: ${brl(a.lucro)} (margem ${a.margem.toFixed(0)}%)\n` +
    `🧾 Pedidos: ${a.num} • Ticket: ${brl(a.ticket)}\n` +
    (campeao ? `🏆 Mais vendido: ${campeao.nome} (${campeao.quantidade}x)\n` : '') +
    `\n💡 ${insight(a, campeao)}`;

  await enviarTexto(sock, destinoPhone, msg);
  console.log(`✅ Relatório diário enviado para ${destinoPhone}.`);
}

/**
 * RELATÓRIO SEMANAL — resume os últimos 7 dias e aponta o melhor dia.
 * Rodado normalmente no dia de folga, às 9h.
 */
export async function enviarRelatorioSemanal(sock, supabase, destinoPhone) {
  if (!destinoPhone) { console.log('⏭️  Relatório semanal: OWNER_ALERT_PHONE não configurado, pulando.'); return; }
  if (!sock) { console.log('⏭️  Relatório semanal: WhatsApp não conectado, pulando.'); return; }

  const fim = endDay(new Date());
  const ini = startDay(addDays(new Date(), -6));
  const a = await agregarPeriodo(supabase, ini, fim);
  const campeao = await saborCampeao(supabase, a.pedidos.map((p) => p.id));

  // Melhor dia da semana
  const porDia = new Map();
  a.pedidos.forEach((p) => {
    const key = startDay(new Date(p.created_at)).toDateString();
    porDia.set(key, (porDia.get(key) || 0) + Number(p.total || 0));
  });
  let melhorDia = null;
  for (const [key, val] of porDia.entries()) {
    if (!melhorDia || val > melhorDia.val) melhorDia = { key, val };
  }
  const melhorDiaTxt = melhorDia
    ? `📌 Melhor dia: ${DIAS[new Date(melhorDia.key).getDay()]} (${brl(melhorDia.val)})\n`
    : '';

  const msg =
    `📅 *Relatório Semanal ESSENZA*\n${ddmm(ini)} a ${ddmm(fim)}\n\n` +
    `💰 Faturamento: *${brl(a.faturamento)}*\n` +
    `📈 Lucro: ${brl(a.lucro)} (margem ${a.margem.toFixed(0)}%)\n` +
    `🧾 Pedidos: ${a.num} • Ticket: ${brl(a.ticket)}\n` +
    melhorDiaTxt +
    (campeao ? `🏆 Mais vendido: ${campeao.nome} (${campeao.quantidade}x)\n` : '') +
    `\n💡 ${insight(a, campeao)}`;

  await enviarTexto(sock, destinoPhone, msg);
  console.log(`✅ Relatório semanal enviado para ${destinoPhone}.`);
}
