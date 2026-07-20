import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Load Environment Variables
// Look in current folder first, then parent folder
const envPath = fs.existsSync('.env') ? '.env' : '../.env';
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const baseWaitTime = parseInt(process.env.BASE_WAIT_TIME || '20');
const waitTimePerOrder = parseInt(process.env.WAIT_TIME_PER_ORDER || '5');
const ownerAlertPhone = process.env.OWNER_ALERT_PHONE || '';
const CARDAPIO_LINK = 'https://canva.link/fz8x4fcgqx23762';
const CARDAPIO_PDF_PATH = path.join(__dirname, 'assets', 'cardapio-essenza.pdf');

// Holds the active Baileys socket so helper functions (owner alerts, the
// pending-human-message poller) can send messages outside the main handler.
let activeSock = null;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Erro: SUPABASE_URL e SUPABASE_KEY não configurados no arquivo .env!');
  process.exit(1);
}

// 2. Initialize Clients
const supabase = createClient(supabaseUrl, supabaseKey);

let genAI = null;
if (geminiApiKey) {
  genAI = new GoogleGenAI({ apiKey: geminiApiKey });
  console.log('🤖 Chave do Gemini configurada com sucesso.');
} else {
  console.warn('⚠️ AVISO: GEMINI_API_KEY não foi encontrada no .env! O bot responderá com mensagens estáticas de teste.');
}

// In-memory chat history (Map: phone -> Array of messages)
const chatHistories = new Map();

// Helper to format BRL currency
const brl = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

// Fetch store products, delivery fees, active orders count and knowledge base
async function getRestaurantContext() {
  try {
    const { data: products } = await supabase.from('produtos').select('*').eq('ativo', true);
    const { data: fees } = await supabase.from('taxa_entrega').select('*').eq('ativo', true);
    const { data: config } = await supabase.from('configuracoes').select('*').maybeSingle();
    const { data: conhecimento } = await supabase.from('ia_conhecimento').select('*').eq('ativo', true);
    const { count } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .in('status', ['recebido', 'preparo', 'forno', 'saiu']);

    const menuText = (products || []).map(p => `- ${p.nome} (${p.categoria_nome}) - R$${p.preco} (${p.tamanho || 'Único'})`).join('\n');
    const freteText = (fees || []).map(t => `- Bairro: ${t.bairro} - Taxa: R$${t.taxa}`).join('\n');
    const conhecimentoText = (conhecimento || []).map(c => `- [${c.topico}] ${c.conteudo}`).join('\n');
    const activeOrders = count || 0;
    const computedWaitTime = baseWaitTime + (activeOrders * waitTimePerOrder);

    return {
      products: products || [],
      fees: fees || [],
      config: config || {},
      activeOrders,
      computedWaitTime,
      contextText: `
--- CONTEXTO ATUAL DA PIZZARIA ESSENZA ---
Nome da Loja: ${config?.nome_loja || 'ESSENZA Pizzaria'}
Horário de Funcionamento: ${config?.horario_abertura || '18:00'} às ${config?.horario_fechamento || '23:59'}
Telefone da Loja: ${config?.telefone_loja || ''}
Endereço da Loja: ${config?.endereco_loja || ''}

Fila de Espera Atual:
- Pedidos em andamento: ${activeOrders}
- Tempo de espera estimado total: ${computedWaitTime} minutos (Base de ${baseWaitTime} min + ${waitTimePerOrder} min por pedido em aberto).

Cardápio Disponível (Apenas venda estes produtos):
${menuText}

Cardápio oficial em PDF (enviado automaticamente quando "attach_menu": true, cite o link só se precisar): ${CARDAPIO_LINK}

Bairros que atendemos e taxas de entrega:
${freteText}
Taxa Fixa Padrão: R$${config?.taxa_fixa_entrega || 5}
${conhecimentoText ? `\nCONHECIMENTO ADICIONAL DA CASA (regras definidas pela equipe, sempre priorize):\n${conhecimentoText}` : ''}
----------------------------------------`
    };
  } catch (e) {
    console.error('Erro ao buscar contexto no banco de dados:', e);
    return { products: [], fees: [], config: {}, activeOrders: 0, computedWaitTime: baseWaitTime, contextText: '' };
  }
}

// ===== Conversation persistence (powers the Monitoramento dashboard) =====

async function getOrCreateConversa(phone, customerName) {
  const { data: existing } = await supabase
    .from('ia_conversas')
    .select('*')
    .eq('telefone', phone)
    .eq('canal', 'whatsapp')
    .neq('status', 'resolvida')
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await supabase
    .from('ia_conversas')
    .insert({ telefone: phone, cliente_nome: customerName || '', canal: 'whatsapp', status: 'ia' })
    .select()
    .maybeSingle();

  return created;
}

async function insertMensagem(conversaId, remetente, texto, enviado = true) {
  if (!conversaId) return;
  await supabase.from('ia_mensagens').insert({ conversa_id: conversaId, remetente, texto, enviado });
  await supabase.from('ia_conversas').update({ last_message_at: new Date().toISOString() }).eq('id', conversaId);
}

async function sendOwnerAlert(customerName, phone, motivo) {
  if (!ownerAlertPhone || !activeSock) return;
  try {
    const jid = `${ownerAlertPhone.replace(/\D/g, '')}@s.whatsapp.net`;
    await activeSock.sendMessage(jid, {
      text: `🚩 *Atenção necessária no WhatsApp da loja*\n\nCliente: ${customerName || 'Não informado'}\nTelefone: ${phone}\nMotivo: ${motivo || 'A IA sinalizou incerteza nesta conversa'}\n\nAbra o painel de Monitoramento para acompanhar ou assumir a conversa.`
    });
  } catch (e) {
    console.error('Erro ao enviar alerta para o dono:', e);
  }
}

// Poll for staff replies typed in the Monitoramento dashboard (status = 'humano')
// and actually deliver them over WhatsApp.
let pollerStarted = false;
function startHumanMessagePoller() {
  if (pollerStarted) return;
  pollerStarted = true;
  setInterval(async () => {
    if (!activeSock) return;
    try {
      const { data: pending } = await supabase
        .from('ia_mensagens')
        .select('*, ia_conversas(telefone)')
        .eq('remetente', 'humano')
        .eq('enviado', false)
        .limit(10);

      for (const msg of pending || []) {
        const phone = msg.ia_conversas?.telefone;
        if (!phone) continue;
        await activeSock.sendMessage(`${phone}@s.whatsapp.net`, { text: msg.texto });
        await supabase.from('ia_mensagens').update({ enviado: true }).eq('id', msg.id);
        console.log(`👤 [${phone}] Atendente humano: ${msg.texto.slice(0, 80)}`);
      }
    } catch (e) {
      console.error('Erro ao verificar mensagens pendentes de atendente humano:', e);
    }
  }, 4000);
}

// Process Gemini AI Response
async function processAiMessage(phone, customerName, messageText, context, audio = null) {
  // Get history
  if (!chatHistories.has(phone)) {
    chatHistories.set(phone, []);
  }
  const history = chatHistories.get(phone);
  history.push({ role: 'user', text: audio ? '[Mensagem de áudio - transcrição pendente]' : messageText });

  // Limit history length to avoid token bloating and keep requests fast
  if (history.length > 16) {
    history.shift();
    history.shift();
  }

  // Fallback if no Gemini Key
  if (!genAI) {
    history.push({ role: 'model', text: 'Simulação: Olá! Para ativar o chatbot com IA real, configure a chave GEMINI_API_KEY no arquivo .env.' });
    return {
      reply: 'Olá! Sou o atendente virtual da ESSENZA. Estamos em modo de simulação porque a chave do Gemini não foi configurada. Qual pizza você gostaria de pedir hoje?',
      action: 'none',
      order_details: null
    };
  }

  const systemPrompt = `Você é a Bia, atendente da ESSENZA Pizzaria pelo WhatsApp. Você é uma pessoa de verdade fazendo esse atendimento — não um robô nem um script decorado. Seja calorosa, atenciosa e genuinamente interessada em bem servir, do jeito que a gente gostaria de ser tratado numa pizzaria de bairro que se importa com o cliente.

### Como se comportar (o tom é tão importante quanto a informação):
1. Cumprimente de forma natural e variada — adequada ao horário do dia (bom dia/boa tarde/boa noite) — sem soar decorado. Pergunte o nome com simpatia se for a primeira mensagem do cliente, e use o nome dele ao longo da conversa (sem exagerar, repetir toda hora soa falso).
2. Escreva como alguém digitaria de verdade no WhatsApp: frases curtas, tom leve, emojis com moderação (não em toda linha). Evite parecer um formulário ou um anúncio.
3. Se o cliente perguntar o cardápio, ou disser que quer pedir algo sem especificar o quê, NÃO digite a lista de produtos em texto. Em vez disso, avise com simpatia que vai te mandar o cardápio completo (ex: "Vou te mandar nosso cardápio completinho aqui! 📄🍕"), marque "attach_menu": true, e você pode citar 2-3 sugestões/destaques rapidamente se quiser. O cardápio oficial (PDF com fotos e descrições) é enviado automaticamente quando você marca esse campo.
4. Quando o cliente escolher pizza, pergunte se prefere inteira (1 sabor) ou meio a meio (2 sabores). Explique com clareza: no meio a meio, cobramos o valor do sabor mais caro dos dois, e **o meio a meio só está disponível no tamanho Grande (G)** — no tamanho Pequeno (P) é só um sabor inteiro. Se o cliente pedir meio a meio no tamanho P, explique isso com gentileza e ofereça o G como alternativa.

### Depois que o cliente já escolheu os itens do cardápio, colete as informações abaixo — uma coisa de cada vez, numa conversa natural, nunca tudo de uma vez num interrogatório:
5. O nome do cliente, se ainda não souber.
6. Pergunte sempre, com clareza: é para **retirar aqui na loja**, para **receber em casa (entrega)**, ou o cliente quer **reservar uma mesa** para vir comer no salão? Nunca assuma isso sozinha.
   - Se for **retirada**: não precisa de endereço nem taxa de entrega. Só confirme o nome e que vai buscar na loja.
   - Se for **entrega**: peça o endereço completo (rua, número) e o Bairro, confirme se atendemos aquela região, e informe com clareza o valor da taxa de entrega daquele bairro (soma no total).
   - Se for **reserva de mesa**: isso NÃO é um pedido de comida, é reservar lugar no salão. Colete nome, quantas pessoas, e o dia/horário desejado. Explique com simpatia que a equipe vai confirmar a disponibilidade em breve. Não pergunte forma de pagamento nem monte itens para uma reserva.
7. Em pedidos (retirada ou entrega), ofereça borda recheada e bebidas de um jeito natural, como sugestão de quem quer que o pedido fique completo — não como script de upsell forçado.
8. **Tempo de espera — só se aplica a pedidos de retirada/entrega, seja sempre honesta, humana e transparente:**
   - O preparo de um pedido leva em torno de 20 minutos do forno até ficar pronto.
   - A pizzaria atende ao mesmo tempo quem pede pelo WhatsApp/delivery E quem está no salão, então o tempo real pode variar de acordo com o quanto a cozinha está corrida no momento. O contexto abaixo te dá o tempo estimado atualizado — use sempre esse número, nunca invente um valor fixo.
   - Os pedidos seguem a ordem de chegada, para ser justo com todo mundo — se for explicar um tempo maior que o normal, faça isso com empatia (ex: "Hoje tá um pouquinho mais movimentado por aqui, mas já já sai a sua" em vez de simplesmente informar um número seco).
   - Reforce que vale a pena esse cuidado porque a pizza sai do forno na hora certa para chegar bem quentinha — isso é prioridade da casa.
9. Em pedidos, pergunte a forma de pagamento (Pix, Cartão ou Dinheiro). Se for dinheiro, pergunte se precisa de troco. Reservas não têm forma de pagamento.
10. **Antes de fechar QUALQUER pedido ou reserva, faça sempre um resumo completo e claro e peça a confirmação explícita do cliente — nunca finalize sem essa confirmação:**
    - Para pedidos: Itens, tipo (retirada ou entrega), taxa de entrega (se houver), valor total, forma de pagamento, e endereço (se for entrega).
    - Para reservas: nome, quantidade de pessoas, dia e horário.
    - Só depois que o cliente confirmar claramente (ex: "sim", "confirmo", "pode mandar", "isso mesmo") você muda a "action". Se o cliente ainda não confirmou, ou pedir para mudar algo, mantenha "action": "none" e continue a conversa.
11. Quando o cliente confirmar e você tiver tudo, finalize com alegria genuína (não robotizada) e retorne o JSON estruturado com a ação correspondente.
12. Se a mensagem mais recente do cliente vier de um ÁUDIO (você vai receber o áudio anexado nesta requisição), ouça com atenção e responda normalmente como se fosse texto, seguindo todas as regras acima. Preencha o campo "customer_message_transcript" com um resumo do que você entendeu do áudio, para registro interno.
13. **Peça ajuda humana quando for o caso** — marque "precisa_atencao_humana": true e explique o motivo em "motivo_atencao" quando: o cliente reclamar de algo (pedido errado, atraso, comida fria, atendimento ruim), pedir para falar com um humano/gerente, perguntar algo bem fora do escopo de pedidos/cardápio/reservas que você não tem informação segura para responder, ou você perceber que está indo pra um impasse. Mesmo marcando isso, continue respondendo o cliente com gentileza normalmente — a marcação só avisa a equipe internamente, o cliente não vê isso.
14. Se houver uma seção "CONHECIMENTO ADICIONAL DA CASA" no contexto abaixo, essas são regras e respostas definidas pela equipe da pizzaria — siga-as sempre que se aplicarem, elas têm prioridade sobre suposições suas.

### Resposta Obrigatória:
Você DEVE SEMPRE responder no formato JSON estruturado com o seguinte schema:
{
  "reply": "Sua mensagem amigável formatada para enviar no WhatsApp (use emojis, negritos e quebras de linha)",
  "action": "place_order" | "request_reservation" | "none",
  "attach_menu": false,
  "precisa_atencao_humana": false,
  "motivo_atencao": "",
  "customer_message_transcript": "Preenchido apenas se a última mensagem do cliente foi um áudio: o que você entendeu que ele disse",
  "order_details": {
    "tipo_pedido": "retirada" | "entrega",
    "items": [
      {
        "product_name": "Nome exato da pizza/bebida no cardápio",
        "quantity": 1,
        "observacao": "Ex: sem cebola",
        "sabor1": "Nome do Sabor 1",
        "sabor2": "Nome do Sabor 2 (se for meio a meio)",
        "adicional": "Nome da Borda (se houver)",
        "adicional_preco": 0
      }
    ],
    "payment_method": "Pix" | "Cartão" | "Dinheiro",
    "customer_name": "Nome do cliente",
    "customer_phone": "Telefone do cliente",
    "customer_address": "Rua e número (apenas se tipo_pedido for entrega)",
    "customer_bairro": "Nome do Bairro exato (apenas se tipo_pedido for entrega)"
  },
  "reservation_details": {
    "customer_name": "Nome do cliente",
    "customer_phone": "Telefone do cliente",
    "data": "AAAA-MM-DD",
    "horario": "HH:MM",
    "numero_pessoas": 2,
    "observacao": "Ex: mesa perto da janela"
  }
}

Importante:
- Mude "action" para "place_order" apenas quando for um pedido de comida (retirada ou entrega) e o cliente já tiver confirmado tudo expressamente, com Nome, Itens, Forma de pagamento e (se entrega) Endereço + Bairro.
- Mude "action" para "request_reservation" apenas quando for reserva de mesa e o cliente já tiver confirmado, com Nome, Número de pessoas, Dia e Horário.
- Caso contrário, mantenha "action": "none", "order_details": null e "reservation_details": null.`;

  const conversationHistory = history
    .map(h => `${h.role === 'user' ? 'Cliente' : 'IA'}: ${h.text}`)
    .join('\n');

  const promptText = `
Você é o atendente de IA da pizzaria ESSENZA. Aqui está o seu manual de instruções e contexto:

${systemPrompt}

${context.contextText}

Histórico da Conversa com o Cliente (Telefone: ${phone}):
${conversationHistory}
${audio ? '\nA última mensagem do Cliente é um ÁUDIO anexado a esta requisição (não texto). Ouça com atenção e responda seguindo o manual acima.' : ''}

Por favor, analise a última mensagem do Cliente, consulte o menu e as taxas acima, e formule a resposta apropriada em formato JSON. Responda APENAS com o JSON puro.
`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
    const parts = [{ text: promptText }];
    if (audio) {
      parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.base64 } });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        temperature: 0.7
      }
    });

    const rawText = result.response.text();
    const cleanJsonStr = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
    const data = JSON.parse(cleanJsonStr);

    // If this was an audio message, replace the placeholder history entry with the transcript
    if (audio && data.customer_message_transcript) {
      history[history.length - 1].text = data.customer_message_transcript;
    }

    history.push({ role: 'model', text: data.reply });
    return data;
  } catch (e) {
    console.error('Erro na chamada da API do Gemini:', e);
    return {
      reply: 'Desculpe, tive um problema temporário ao processar sua resposta. Pode repetir por favor?',
      action: 'none',
      order_details: null
    };
  }
}

// Insert Order into Supabase
async function createDatabaseOrder(orderDetails, phone, context) {
  console.log(`🛒 Lançando pedido no banco de dados para ${orderDetails.customer_name}...`);
  
  try {
    // 1. Find or Create Customer
    let clienteId = null;
    const { data: existingCustomer } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefone', phone)
      .maybeSingle();

    if (existingCustomer) {
      clienteId = existingCustomer.id;
    } else {
      const { data: newCustomer } = await supabase
        .from('clientes')
        .insert({
          nome: orderDetails.customer_name || 'Cliente WhatsApp',
          telefone: phone,
          endereco: orderDetails.customer_address || '',
          bairro: orderDetails.customer_bairro || 'Centro',
        })
        .select()
        .maybeSingle();
      clienteId = newCustomer?.id || null;
    }

    // 2. Compute items details
    let subtotal = 0;
    let custoTotal = 0;

    const orderItems = orderDetails.items.map((item) => {
      let dbProd1 = context.products.find(p => p.nome.toLowerCase() === item.product_name.toLowerCase());
      let dbProd2 = item.sabor2 ? context.products.find(p => p.nome.toLowerCase() === item.sabor2.toLowerCase()) : null;
      let dbSabor1 = item.sabor1 ? context.products.find(p => p.nome.toLowerCase() === item.sabor1.toLowerCase()) : dbProd1;

      let precoUnit = 40;
      let custoUnit = 15;
      let prodId = dbProd1?.id || dbSabor1?.id || null;

      if (dbProd2 && dbSabor1) {
        precoUnit = Math.max(dbSabor1.preco, dbProd2.preco);
        custoUnit = Math.max(dbSabor1.custo, dbProd2.custo);
      } else if (dbProd1) {
        precoUnit = dbProd1.preco;
        custoUnit = dbProd1.custo;
      }

      const qty = item.quantity || 1;
      const addPreco = item.adicional_preco || 0;
      
      subtotal += qty * (precoUnit + addPreco);
      custoTotal += qty * custoUnit;

      return {
        produto_id: prodId,
        produto_nome: item.product_name,
        quantidade: qty,
        preco_unitario: precoUnit,
        custo_unitario: custoUnit,
        observacao: item.observacao || '',
        sabor1: item.sabor1 || '',
        sabor2: item.sabor2 || '',
        adicional: item.adicional || '',
        adicional_preco: addPreco
      };
    });

    // Tipo de pedido: retirada (balcão) x entrega (delivery) — taxa só se aplica à entrega
    const isEntrega = orderDetails.tipo_pedido === 'entrega';
    const matchedTaxa = context.fees.find(t => t.bairro.toLowerCase() === (orderDetails.customer_bairro || '').toLowerCase());
    const taxaEntrega = isEntrega ? (matchedTaxa ? matchedTaxa.taxa : (context.config?.taxa_fixa_entrega || 5)) : 0;
    const total = subtotal + taxaEntrega;
    const lucro = subtotal - custoTotal;

    // 3. Get next sequence number
    const { data: numData } = await supabase.rpc('get_next_pedido_numero').maybeSingle();
    const numero = numData || Math.floor(Math.random() * 1000) + 1;

    // 4. Insert Order
    const { data: createdPedido, error: orderError } = await supabase
      .from('pedidos')
      .insert({
        numero,
        cliente_id: clienteId,
        cliente_nome: orderDetails.customer_name || 'Cliente WhatsApp',
        cliente_telefone: phone,
        cliente_endereco: isEntrega ? (orderDetails.customer_address || '') : '',
        cliente_bairro: isEntrega ? (orderDetails.customer_bairro || '') : '',
        tipo: isEntrega ? 'delivery' : 'balcao',
        status: 'recebido',
        subtotal,
        taxa_entrega: taxaEntrega,
        desconto: 0,
        total,
        custo_total: custoTotal,
        lucro,
        forma_pagamento: orderDetails.payment_method || 'Pix',
        observacao: `Pedido WhatsApp (${isEntrega ? 'Entrega' : 'Retirada'}) - ${phone}`,
        cupom: ''
      })
      .select()
      .maybeSingle();

    if (orderError || !createdPedido) throw new Error(orderError?.message || 'Falha ao criar o pedido');

    // 5. Insert Items
    const { error: itemsError } = await supabase
      .from('itens_pedido')
      .insert(orderItems.map((item) => ({
        ...item,
        pedido_id: createdPedido.id
      })));

    if (itemsError) throw new Error(itemsError.message);

    // 6. Register Cash Entry (Caixa)
    await supabase.from('caixa').insert({
      tipo: 'entrada',
      descricao: `Pedido WhatsApp #${numero} - ${orderDetails.customer_name}`,
      valor: total,
      forma_pagamento: orderDetails.payment_method || 'Pix',
      pedido_id: createdPedido.id,
      data: new Date().toISOString().slice(0, 10)
    });

    console.log(`✅ Pedido #${numero} gravado com sucesso!`);
    return { numero, total, taxaEntrega, orderItems, isEntrega };
  } catch (e) {
    console.error('❌ Falha ao gravar pedido no banco:', e);
    return null;
  }
}

// Insert Table Reservation into Supabase
async function createReservation(reservationDetails, phone) {
  console.log(`📅 Registrando reserva de mesa para ${reservationDetails.customer_name}...`);

  try {
    const { error: reservaError } = await supabase.from('reservas').insert({
      cliente_nome: reservationDetails.customer_name || 'Cliente WhatsApp',
      cliente_telefone: phone,
      data: reservationDetails.data,
      horario: reservationDetails.horario || '',
      numero_pessoas: reservationDetails.numero_pessoas || 1,
      observacao: reservationDetails.observacao || '',
      status: 'pendente'
    });

    if (reservaError) throw new Error(reservaError.message);

    console.log(`✅ Reserva registrada com sucesso!`);
    return true;
  } catch (e) {
    console.error('❌ Falha ao gravar reserva no banco:', e);
    return false;
  }
}

// 3. Setup WhatsApp Connection
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  
  console.log(`🤖 Iniciando WhatsApp Web (Baileys v${version.join('.')})...`);

  const sock = makeWASocket.default({
    version,
    printQRInTerminal: false, // Custom print QR code to avoid terminal issues
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['ESSENZA Bot', 'Safari', '3.0']
  });

  activeSock = sock;

  // Save session credentials on updates
  sock.ev.on('creds.update', saveCreds);

  // Monitor connection states
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 Leia o QR Code abaixo no seu WhatsApp para conectar o bot:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('🔌 Conexão fechada. Motivo:', lastDisconnect?.error || 'Desconhecido');
      if (shouldReconnect) {
        console.log('🔄 Tentando reconectar...');
        connectToWhatsApp();
      } else {
        console.log('❌ Bot desconectado permanentemente. Exclua a pasta "auth_info_baileys" e rode novamente para re-escanear.');
      }
    } else if (connection === 'open') {
      console.log('🚀 WhatsApp conectado com sucesso! O bot de IA está pronto para atender.');
      startHumanMessagePoller();
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    // Check if it is a private chat
    const from = msg.key.remoteJid;
    if (!from.endsWith('@s.whatsapp.net')) return;

    const senderPhone = from.split('@')[0];
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const audioMessage = msg.message.audioMessage;

    if (!text.trim() && !audioMessage) return;

    // Track this conversation for the Monitoramento dashboard
    const conversa = await getOrCreateConversa(senderPhone, msg.pushName || 'Cliente');

    // If a staff member has taken over this conversation, just log the customer's
    // message for the dashboard and let the human handle it — the AI stays silent.
    if (conversa?.status === 'humano') {
      await insertMensagem(conversa.id, 'cliente', text || '[Mensagem de áudio]');
      await sock.readMessages([msg.key]);
      return;
    }

    // Download and prepare audio for Gemini (voice notes / audio files)
    let audio = null;
    if (audioMessage) {
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
        audio = { mimeType: audioMessage.mimetype || 'audio/ogg; codecs=opus', base64: buffer.toString('base64') };
        console.log(`🎤 [${senderPhone}] Cliente enviou um áudio (${Math.round(buffer.length / 1024)} KB)`);
      } catch (e) {
        console.error('Erro ao baixar áudio:', e);
      }
    } else {
      console.log(`📩 [${senderPhone}] Cliente: ${text}`);
    }

    // Mark message as read / typing indicator
    await sock.readMessages([msg.key]);
    await sock.sendPresenceUpdate('composing', from);

    // Get current context from Supabase
    const context = await getRestaurantContext();

    // Call Gemini IA (text or audio)
    const result = await processAiMessage(senderPhone, msg.pushName || 'Cliente', text, context, audio);

    // Persist the exchange for the Monitoramento dashboard
    await insertMensagem(conversa?.id, 'cliente', (audio ? result.customer_message_transcript : text) || text || '[Mensagem de áudio]');
    if (result.reply) await insertMensagem(conversa?.id, 'ia', result.reply);

    // Send normal reply message
    if (result.reply) {
      await sock.sendPresenceUpdate('paused', from);
      await sock.sendMessage(from, { text: result.reply });
      console.log(`🤖 [${senderPhone}] Bot: ${result.reply.slice(0, 100).replace(/\n/g, ' ')}...`);
    }

    // Send the official menu PDF when the AI decides it's time to show it
    if (result.attach_menu) {
      try {
        await sock.sendMessage(from, {
          document: fs.readFileSync(CARDAPIO_PDF_PATH),
          mimetype: 'application/pdf',
          fileName: 'Cardapio ESSENZA.pdf'
        });
      } catch (e) {
        console.error('Erro ao enviar PDF do cardápio:', e);
        await sock.sendMessage(from, { text: `Segue nosso cardápio completo: ${CARDAPIO_LINK}` });
      }
    }

    // Flag the conversation and alert the owner if the AI is unsure / detects a problem
    if (result.precisa_atencao_humana && conversa?.id) {
      await supabase.from('ia_conversas').update({
        precisa_atencao: true,
        motivo_atencao: result.motivo_atencao || 'A IA sinalizou incerteza nesta conversa'
      }).eq('id', conversa.id);
      await sendOwnerAlert(msg.pushName || 'Cliente', senderPhone, result.motivo_atencao);
    }

    // Process order if IA confirmed
    if (result.action === 'place_order' && result.order_details) {
      const orderResult = await createDatabaseOrder(result.order_details, senderPhone, context);

      if (orderResult) {
        // Send order confirmation message
        const computedWait = baseWaitTime + (context.activeOrders * waitTimePerOrder);
        const confirmationMsg = `🎉 *Pedido Confirmado!*
Seu pedido é o de número *#${orderResult.numero}*.

🍕 *Resumo do Pedido:*
${orderResult.orderItems.map(i => `- ${i.quantidade}x ${i.produto_nome} ${i.observacao ? `(_Obs: ${i.observacao}_)` : ''}`).join('\n')}

💰 *Total:* ${brl(orderResult.total)}${orderResult.isEntrega ? ` (com entrega de ${brl(orderResult.taxaEntrega)} para o bairro ${result.order_details.customer_bairro})` : ' (retirada na loja, sem taxa)'}
💳 *Pagamento:* ${result.order_details.payment_method}
${orderResult.isEntrega ? `📍 *Endereço:* ${result.order_details.customer_address}` : '🏠 *Retirada:* aqui na loja'}
⏱️ *Tempo de espera estimado:* ${computedWait} minutos.

Nossa equipe já está preparando! Qualquer dúvida, nos avise. Obrigado!`;

        await sock.sendMessage(from, { text: confirmationMsg });
        await insertMensagem(conversa?.id, 'ia', confirmationMsg);
        console.log(`🤖 [${senderPhone}] Bot: Pedido #${orderResult.numero} confirmado e enviado.`);
      } else {
        const failMsg = 'Desculpe, tive um problema ao salvar seu pedido no sistema. Por favor, fale com um atendente humano para confirmar.';
        await sock.sendMessage(from, { text: failMsg });
        await insertMensagem(conversa?.id, 'ia', failMsg);
      }
    }

    // Process table reservation if IA confirmed
    if (result.action === 'request_reservation' && result.reservation_details) {
      const ok = await createReservation(result.reservation_details, senderPhone);

      if (ok) {
        const confirmationMsg = `🎉 *Reserva Recebida!*

📅 *Data:* ${result.reservation_details.data}
🕒 *Horário:* ${result.reservation_details.horario}
👥 *Pessoas:* ${result.reservation_details.numero_pessoas}
🙋 *Nome:* ${result.reservation_details.customer_name}

Nossa equipe vai confirmar a disponibilidade da mesa e te avisa por aqui em breve. Até já! 🍕`;

        await sock.sendMessage(from, { text: confirmationMsg });
        await insertMensagem(conversa?.id, 'ia', confirmationMsg);
        console.log(`🤖 [${senderPhone}] Bot: Reserva confirmada e enviada.`);
      } else {
        const failMsg = 'Desculpe, tive um problema ao registrar sua reserva no sistema. Por favor, fale com um atendente humano para confirmar.';
        await sock.sendMessage(from, { text: failMsg });
        await insertMensagem(conversa?.id, 'ia', failMsg);
      }
    }
  });
}

// Start
connectToWhatsApp();
