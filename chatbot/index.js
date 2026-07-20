import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 1. Load Environment Variables
// Look in current folder first, then parent folder
const envPath = fs.existsSync('.env') ? '.env' : '../.env';
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const baseWaitTime = parseInt(process.env.BASE_WAIT_TIME || '30');
const waitTimePerOrder = parseInt(process.env.WAIT_TIME_PER_ORDER || '5');

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

// Fetch store products, delivery fees and active orders count
async function getRestaurantContext() {
  try {
    const { data: products } = await supabase.from('produtos').select('*').eq('ativo', true);
    const { data: fees } = await supabase.from('taxa_entrega').select('*').eq('ativo', true);
    const { data: config } = await supabase.from('configuracoes').select('*').maybeSingle();
    const { count } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .in('status', ['recebido', 'preparo', 'forno', 'saiu']);

    const menuText = (products || []).map(p => `- ${p.nome} (${p.categoria_nome}) - R$${p.preco} (${p.tamanho || 'Único'})`).join('\n');
    const freteText = (fees || []).map(t => `- Bairro: ${t.bairro} - Taxa: R$${t.taxa}`).join('\n');
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

Bairros que atendemos e taxas de entrega:
${freteText}
Taxa Fixa Padrão: R$${config?.taxa_fixa_entrega || 5}
----------------------------------------`
    };
  } catch (e) {
    console.error('Erro ao buscar contexto no banco de dados:', e);
    return { products: [], fees: [], config: {}, activeOrders: 0, computedWaitTime: baseWaitTime, contextText: '' };
  }
}

// Process Gemini AI Response
async function processAiMessage(phone, customerName, messageText, context) {
  // Get history
  if (!chatHistories.has(phone)) {
    chatHistories.set(phone, []);
  }
  const history = chatHistories.get(phone);
  history.push({ role: 'user', text: messageText });

  // Limit history length to avoid token bloating
  if (history.length > 20) {
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

  const systemPrompt = `Você é o "Essenza Bot", o atendente de Inteligência Artificial perfeito da ESSENZA Pizzaria.
Seu objetivo é ser extremamente educado, amigável, prestativo e profissional no atendimento aos clientes pelo WhatsApp, tratando-os muito bem.

### Regras Principais de Atendimento (Seja o Atendente Perfeito):
1. Cumprimente o cliente com entusiasmo! Dê sempre "Boa noite" (ou o cumprimento adequado para o momento), pergunte como ele está e pergunte o que ele deseja pedir hoje de forma muito acolhedora.
2. Para novos clientes, peça sempre o Nome de forma simpática para personalizar o atendimento.
3. Quando o cliente pedir pizza, pergunte ativamente se ele deseja que a pizza seja "meio a meio" (dois sabores) ou se prefere inteira de um sabor só.
4. Explique com clareza a regra de meio a meio: o cliente pode escolher até 2 sabores para a pizza, e o preço cobrado será o do sabor de maior valor da nossa tabela de preços.
5. Ao apresentar o cardápio, formate os produtos com clareza, caprichando na apresentação (ex: *Nome da Pizza* - R$ Preço).
6. Peça o endereço completo de entrega (rua, número) e o Bairro (confirme se o bairro dele está na nossa lista de bairros atendidos).
7. Ofereça de forma gentil a adição de borda recheada ou bebidas para acompanhar o pedido.
8. Informe sempre o tempo de espera atualizado fornecido no contexto de forma clara e honesta.
9. Pergunte a forma de pagamento (Pix, Cartão ou Dinheiro). Se for dinheiro, pergunte se precisa de troco.
10. Faça um resumo detalhado e caprichado com: Itens, Taxa de entrega, Valor total, Forma de pagamento e Endereço antes de pedir a confirmação final.
11. Quando o cliente confirmar e estiver tudo pronto para lançar, responda finalizando de forma alegre e retorne um objeto estruturado em JSON com a ação correspondente para salvar o pedido.

### Resposta Obrigatória:
Você DEVE SEMPRE responder no formato JSON estruturado com o seguinte schema:
{
  "reply": "Sua mensagem amigável formatada para enviar no WhatsApp (use emojis, negritos e quebras de linha)",
  "action": "place_order" ou "none",
  "order_details": {
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
    "customer_address": "Rua e número de entrega",
    "customer_bairro": "Nome do Bairro exato"
  }
}

Importante: Apenas mude a "action" para "place_order" no exato momento em que o cliente confirmou expressamente o fechamento do pedido e você tiver todas as informações obrigatórias (Nome, Endereço, Bairro, Itens do pedido e Forma de pagamento). Caso contrário, mantenha "action": "none" e "order_details": null.`;

  const conversationHistory = history
    .map(h => `${h.role === 'user' ? 'Cliente' : 'IA'}: ${h.text}`)
    .join('\n');

  const promptText = `
Você é o atendente de IA da pizzaria ESSENZA. Aqui está o seu manual de instruções e contexto:

${systemPrompt}

${context.contextText}

Histórico da Conversa com o Cliente (Telefone: ${phone}):
${conversationHistory}

Por favor, analise a última mensagem do Cliente no histórico, consulte o menu e as taxas acima, e formule a resposta apropriada em formato JSON. Responda APENAS com o JSON puro.
`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const rawText = result.response.text();
    const cleanJsonStr = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
    const data = JSON.parse(cleanJsonStr);

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

    // Taxa entrega
    const matchedTaxa = context.fees.find(t => t.bairro.toLowerCase() === (orderDetails.customer_bairro || '').toLowerCase());
    const taxaEntrega = matchedTaxa ? matchedTaxa.taxa : (context.config?.taxa_fixa_entrega || 5);
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
        cliente_endereco: orderDetails.customer_address || '',
        cliente_bairro: orderDetails.customer_bairro || '',
        tipo: 'delivery',
        status: 'recebido',
        subtotal,
        taxa_entrega: taxaEntrega,
        desconto: 0,
        total,
        custo_total: custoTotal,
        lucro,
        forma_pagamento: orderDetails.payment_method || 'Pix',
        observacao: `Pedido WhatsApp - ${phone}`,
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
    return { numero, total, taxaEntrega, orderItems };
  } catch (e) {
    console.error('❌ Falha ao gravar pedido no banco:', e);
    return null;
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
    
    if (!text.trim()) return;

    console.log(`📩 [${senderPhone}] Cliente: ${text}`);

    // Mark message as read / typing indicator
    await sock.readMessages([msg.key]);
    await sock.sendPresenceUpdate('composing', from);

    // Get current context from Supabase
    const context = await getRestaurantContext();

    // Call Gemini IA
    const result = await processAiMessage(senderPhone, msg.pushName || 'Cliente', text, context);

    // Send normal reply message
    if (result.reply) {
      await sock.sendPresenceUpdate('paused', from);
      await sock.sendMessage(from, { text: result.reply });
      console.log(`🤖 [${senderPhone}] Bot: ${result.reply.slice(0, 100).replace(/\n/g, ' ')}...`);
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
${orderResult.orderItems.map(i => `- ${i.quantidade}x ${i.produto_name} ${i.observacao ? `(_Obs: ${i.observacao}_)` : ''}`).join('\n')}

💰 *Total:* ${brl(orderResult.total)} (com entrega de ${brl(orderResult.taxaEntrega)} para o bairro ${result.order_details.customer_bairro})
💳 *Pagamento:* ${result.order_details.payment_method}
📍 *Endereço:* ${result.order_details.customer_address}
⏱️ *Tempo de espera estimado:* ${computedWait} minutos.

Nossa equipe já está preparando! Qualquer dúvida, nos avise. Obrigado!`;

        await sock.sendMessage(from, { text: confirmationMsg });
        console.log(`🤖 [${senderPhone}] Bot: Pedido #${orderResult.numero} confirmado e enviado.`);
      } else {
        await sock.sendMessage(from, { text: 'Desculpe, tive um problema ao salvar seu pedido no sistema. Por favor, fale com um atendente humano para confirmar.' });
      }
    }
  });
}

// Start
connectToWhatsApp();
