import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { brl } from '../../lib/format';
import { 
  Bot, Send, Smartphone, Settings, Key, Clock, Sparkles, 
  CheckCircle2, Trash2, RefreshCw, AlertTriangle, Play, HelpCircle
} from 'lucide-react';
import type { Produto, TaxaEntrega, Cliente } from '../../types';

interface Message {
  id: string;
  sender: 'customer' | 'bot' | 'system';
  text: string;
  timestamp: Date;
}

interface Chat {
  id: string;
  name: string;
  phone: string;
  messages: Message[];
}

export function IAWhatsApp() {
  const { config } = useConfig();
  const [activeTab, setActiveTab] = useState<'simulator' | 'settings' | 'real-connection'>('simulator');
  
  // Settings States
  const [geminiKey, setGeminiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [baseWaitTime, setBaseWaitTime] = useState(30);
  const [waitTimePerOrder, setWaitTimePerOrder] = useState(5);
  const [whatsappApiUrl, setWhatsappApiUrl] = useState('http://localhost:8000');
  const [whatsappToken, setWhatsappToken] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Db States
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [taxas, setTaxas] = useState<TaxaEntrega[]>([]);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);

  // Simulator States
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Settings from LocalStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('essenza_gemini_api_key') || '';
    const savedPrompt = localStorage.getItem('essenza_ia_system_prompt') || '';
    const savedBaseWait = localStorage.getItem('essenza_ia_base_wait') || '30';
    const savedWaitPer = localStorage.getItem('essenza_ia_wait_per_order') || '5';
    const savedApiUrl = localStorage.getItem('essenza_whatsapp_api_url') || 'http://localhost:8000';
    const savedToken = localStorage.getItem('essenza_whatsapp_token') || '';
    const savedActive = localStorage.getItem('essenza_ia_active') !== 'false';

    setGeminiKey(savedKey);
    setBaseWaitTime(parseInt(savedBaseWait));
    setWaitTimePerOrder(parseInt(savedWaitPer));
    setWhatsappApiUrl(savedApiUrl);
    setWhatsappToken(savedToken);
    setIsActive(savedActive);

    if (savedPrompt) {
      setSystemPrompt(savedPrompt);
    } else {
      // Default System Prompt
      const defaultPrompt = `Você é o "Essenza Bot", o atendente de Inteligência Artificial perfeito da ESSENZA Pizzaria.
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
      setSystemPrompt(defaultPrompt);
    }
  }, []);

  // Save Settings to LocalStorage
  const saveSettings = () => {
    localStorage.setItem('essenza_gemini_api_key', geminiKey);
    localStorage.setItem('essenza_ia_system_prompt', systemPrompt);
    localStorage.setItem('essenza_ia_base_wait', String(baseWaitTime));
    localStorage.setItem('essenza_ia_wait_per_order', String(waitTimePerOrder));
    localStorage.setItem('essenza_whatsapp_api_url', whatsappApiUrl);
    localStorage.setItem('essenza_whatsapp_token', whatsappToken);
    localStorage.setItem('essenza_ia_active', String(isActive));
    alert('Configurações salvas com sucesso!');
  };

  // Fetch Database Info to Context
  const loadDatabaseInfo = useCallback(async () => {
    setDbLoading(true);
    try {
      // 1. Load active products
      const { data: dbProducts } = await supabase
        .from('produtos')
        .select('*')
        .eq('ativo', true);
      setProdutos(dbProducts || []);

      // 2. Load delivery fees
      const { data: dbTaxas } = await supabase
        .from('taxa_entrega')
        .select('*')
        .eq('ativo', true);
      setTaxas(dbTaxas || []);

      // 3. Load active orders to calculate wait time
      const { count } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .in('status', ['recebido', 'preparo', 'forno', 'saiu']);
      setActiveOrdersCount(count || 0);
    } catch (e) {
      console.error('Erro ao buscar dados do Supabase:', e);
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabaseInfo();
  }, [loadDatabaseInfo]);

  // Load Mock Chats / Messages
  useEffect(() => {
    const mockChats: Chat[] = [
      {
        id: 'chat-1',
        name: 'Carlos Oliveira',
        phone: '+55 11 99999-1111',
        messages: [
          { id: '1', sender: 'customer', text: 'Boa noite! Queria ver o cardápio de vocês.', timestamp: new Date(Date.now() - 3600000) },
          { id: '2', sender: 'bot', text: 'Boa noite, Carlos! Seja muito bem-vindo à ESSENZA Pizzaria! 🍕✨\n\nQual o seu nome? E como posso te ajudar hoje? Se quiser fazer um pedido, temos pizzas artesanais deliciosas!', timestamp: new Date(Date.now() - 3590000) }
        ]
      },
      {
        id: 'chat-2',
        name: 'Maria Souza (Nova)',
        phone: '+55 11 98888-2222',
        messages: [
          { id: '1', sender: 'customer', text: 'Olá, entregam no Centro?', timestamp: new Date(Date.now() - 60000) }
        ]
      }
    ];
    setChats(mockChats);
    setActiveChatId('chat-2');
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId, isTyping]);

  const activeChat = chats.find(c => c.id === activeChatId);

  // Add Message to Chat
  const addMessage = (chatId: string, sender: 'customer' | 'bot' | 'system', text: string) => {
    setChats(prev => prev.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          messages: [
            ...chat.messages,
            { id: String(Date.now() + Math.random()), sender, text, timestamp: new Date() }
          ]
        };
      }
      return chat;
    }));
  };

  // Create a new simulated chat session
  const createNewChat = () => {
    const id = 'chat-' + Date.now();
    const newChat: Chat = {
      id,
      name: `Cliente Simulado #${chats.length + 1}`,
      phone: `+55 11 9${Math.floor(10000000 + Math.random() * 90000000)}`,
      messages: [
        { id: 'start', sender: 'system', text: 'Conversa simulada iniciada. Digite uma mensagem abaixo para falar com o robô.', timestamp: new Date() }
      ]
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(id);
  };

  // Clear current chat history
  const clearChatHistory = (chatId: string) => {
    setChats(prev => prev.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          messages: [{ id: 'start', sender: 'system', text: 'Histórico limpo.', timestamp: new Date() }]
        };
      }
      return chat;
    }));
  };

  // Handle Order Database Insertion (The Action Callback)
  const processDatabaseOrder = async (orderDetails: any, chatId: string) => {
    addMessage(chatId, 'system', '⚙️ Iniciando lançamento automático do pedido no banco de dados...');
    
    try {
      // 1. Create or Find Customer
      let clienteId: string | null = null;
      const customerPhone = orderDetails.customer_phone || activeChat?.phone || 'whatsapp-sim';
      
      const { data: existingCustomer } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefone', customerPhone)
        .maybeSingle();

      if (existingCustomer) {
        clienteId = existingCustomer.id;
      } else {
        const { data: newCustomer } = await supabase
          .from('clientes')
          .insert({
            nome: orderDetails.customer_name || 'Cliente WhatsApp',
            telefone: customerPhone,
            endereco: orderDetails.customer_address || 'Entregar no WhatsApp',
            bairro: orderDetails.customer_bairro || 'Centro',
          })
          .select()
          .maybeSingle();
        clienteId = (newCustomer as Cliente)?.id || null;
      }

      // 2. Calculate Pricing and Details
      let subtotal = 0;
      let custoTotal = 0;
      
      const orderItems = orderDetails.items.map((item: any) => {
        // Find exact product matches in DB
        let dbProd1 = produtos.find(p => p.nome.toLowerCase() === item.product_name.toLowerCase());
        
        // If half and half
        let dbProd2 = item.sabor2 ? produtos.find(p => p.nome.toLowerCase() === item.sabor2.toLowerCase()) : null;
        let dbSabor1 = item.sabor1 ? produtos.find(p => p.nome.toLowerCase() === item.sabor1.toLowerCase()) : dbProd1;

        let precoUnit = 40; // Default fallback
        let custoUnit = 15; // Default fallback
        let prodId = dbProd1?.id || dbSabor1?.id || null;

        if (dbProd2 && dbSabor1) {
          // Half and half rules: cobra o mais caro
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

      // Taxa de entrega
      const bairroName = orderDetails.customer_bairro || '';
      const matchedTaxa = taxas.find(t => t.bairro.toLowerCase() === bairroName.toLowerCase());
      const taxaEntrega = matchedTaxa ? matchedTaxa.taxa : (config?.taxa_fixa_entrega || 5);
      const total = subtotal + taxaEntrega;
      const lucro = subtotal - custoTotal;

      // 3. Get next order sequence number
      const { data: numData } = await supabase.rpc('get_next_pedido_numero').maybeSingle();
      const numero = (numData as number) || Math.floor(Math.random() * 1000) + 1;

      // 4. Create Order
      const pedidoObj = {
        numero,
        cliente_id: clienteId,
        cliente_nome: orderDetails.customer_name || 'Cliente WhatsApp',
        cliente_telefone: customerPhone,
        cliente_endereco: orderDetails.customer_address || '',
        cliente_bairro: orderDetails.customer_bairro || '',
        tipo: 'delivery' as const,
        status: 'recebido' as const,
        subtotal,
        taxa_entrega: taxaEntrega,
        desconto: 0,
        total,
        custo_total: custoTotal,
        lucro,
        forma_pagamento: orderDetails.payment_method || 'Pix',
        observacao: `Pedido IA - ${customerPhone}`,
        cupom: ''
      };

      const { data: createdPedido, error: orderError } = await supabase
        .from('pedidos')
        .insert(pedidoObj)
        .select()
        .maybeSingle();

      if (orderError || !createdPedido) throw new Error(orderError?.message || 'Falha ao criar registro do pedido');

      // 5. Insert Items
      const { error: itemsError } = await supabase
        .from('itens_pedido')
        .insert(orderItems.map((item: any) => ({
          ...item,
          pedido_id: createdPedido.id
        })));

      if (itemsError) throw new Error(itemsError.message);

      // 6. Register Cash Entry (Caixa)
      await supabase.from('caixa').insert({
        tipo: 'entrada',
        descricao: `Pedido IA #${numero} - ${orderDetails.customer_name}`,
        valor: total,
        forma_pagamento: orderDetails.payment_method || 'Pix',
        pedido_id: createdPedido.id,
        data: new Date().toISOString().slice(0, 10)
      });

      addMessage(chatId, 'system', `✅ Pedido #${numero} gravado com sucesso no banco de dados da Pizzaria! Ele já aparece na tela de pedidos da cozinha.`);
      
      // Notify wait time in bot response
      const computedWait = baseWaitTime + (activeOrdersCount * waitTimePerOrder);
      setTimeout(() => {
        addMessage(chatId, 'bot', `🎉 *Pedido Confirmado!*
Seu pedido é o de número *#${numero}*.

🍕 *Resumo do Pedido:*
${orderItems.map((i: any) => `- ${i.quantidade}x ${i.produto_name} ${i.observacao ? `(_Obs: ${i.observacao}_)` : ''}`).join('\n')}

💰 *Total:* ${brl(total)} (com entrega de ${brl(taxaEntrega)} para o bairro ${orderDetails.customer_bairro})
💳 *Pagamento:* ${orderDetails.payment_method}
📍 *Endereço:* ${orderDetails.customer_address}
⏱️ *Tempo de espera estimado:* ${computedWait} minutos.

Nossa equipe já está preparando a sua massa com muito carinho! Qualquer dúvida, estamos aqui.`);
      }, 1000);

      loadDatabaseInfo(); // Refresh orders count

    } catch (e: any) {
      console.error(e);
      addMessage(chatId, 'system', `❌ Falha ao lançar pedido automaticamente: ${e.message || 'Erro inesperado'}`);
    }
  };

  // Call Gemini API (or Simulator Fallback)
  const queryAI = async (chatId: string, currentChat: Chat, textToSend: string) => {
    setIsTyping(true);

    // Format contextual menu and rates for Gemini
    const menuContext = produtos.map(p => `- ${p.nome} (${p.categoria_nome}) - Preço: R$${p.preco} (Tamanho: ${p.tamanho || 'Único'})`).join('\n');
    const freteContext = taxas.map(t => `- Bairro: ${t.bairro} - Taxa: R$${t.taxa}`).join('\n');
    const computedWaitTime = baseWaitTime + (activeOrdersCount * waitTimePerOrder);

    const storeContext = `
--- CONTEXTO ATUAL DA PIZZARIA ESSENZA ---
Nome da Loja: ${config?.nome_loja || 'ESSENZA Pizzaria'}
Horário de Funcionamento: ${config?.horario_abertura || '18:00'} às ${config?.horario_fechamento || '23:59'}
Telefone da Loja: ${config?.telefone_loja || ''}
Endereço da Loja: ${config?.endereco_loja || ''}

Fila de Espera Atual:
- Pedidos em andamento: ${activeOrdersCount}
- Tempo de espera estimado total: ${computedWaitTime} minutos (Base de ${baseWaitTime} min + ${waitTimePerOrder} min por pedido em aberto).

Cardápio Disponível (Apenas venda estes produtos):
${menuContext}

Bairros que atendemos e taxas de entrega:
${freteContext}
Taxa Fixa Padrão (para bairros não listados): R$${config?.taxa_fixa_entrega || 5}
----------------------------------------
    `;

    // Format chat history
    const conversationHistory = currentChat.messages
      .filter(m => m.sender !== 'system')
      .map(m => `${m.sender === 'customer' ? 'Cliente' : 'IA'}: ${m.text}`)
      .join('\n');

    const promptText = `
Você é o atendente de IA da pizzaria ESSENZA. Aqui está o seu manual de instruções e contexto:

${systemPrompt}

${storeContext}

Histórico da Conversa com o Cliente (Telefone: ${currentChat.phone}):
${conversationHistory}
Cliente: ${textToSend}

Por favor, analise a última mensagem do Cliente no histórico, consulte o menu e as taxas acima, e formule a resposta apropriada em formato JSON. Responda APENAS com o JSON puro, sem usar markdown (sem \`\`\`json no início ou no fim).
`;

    // 1. If Gemini API Key is not set, use Mock AI Tree
    if (!geminiKey) {
      setTimeout(() => {
        setIsTyping(false);
        const lower = textToSend.toLowerCase();
        
        let responseJson = {
          reply: "",
          action: "none",
          order_details: null
        };

        if (lower.includes('olá') || lower.includes('ola') || lower.includes('bom dia') || lower.includes('boa tarde') || lower.includes('boa noite') || lower.includes('oi')) {
          responseJson.reply = `Olá! Seja muito bem-vindo à *ESSENZA Pizzaria*! 🍕✨\n\nEstou pronto para te atender. Gostaria de ver o nosso cardápio ou fazer um pedido? *(Nota: Você pode ativar a IA real inserindo sua chave do Gemini na aba "Configurações da IA")*`;
        } else if (lower.includes('cardapio') || lower.includes('cardápio') || lower.includes('sabor') || lower.includes('sabores') || lower.includes('menu')) {
          const list = produtos.length > 0 ? produtos.map(p => `• *${p.nome}* - R$${p.preco}`).join('\n') : '• Pizza Calabresa - R$45\n• Pizza Marguerita - R$40\n• Coca-Cola 2L - R$10';
          responseJson.reply = `Aqui está o nosso cardápio de pizzas ativas no momento: \n\n${list}\n\nQual delas você deseja pedir hoje?`;
        } else if (lower.includes('calabresa') || lower.includes('marguerita') || lower.includes('margarita')) {
          const pName = lower.includes('calabresa') ? 'Calabresa' : 'Marguerita';
          responseJson.reply = `Ótima escolha! Uma pizza de *${pName}*. 😋\n\nPor favor, me informe:\n1. Seu **Nome**\n2. Seu **Endereço Completos** e **Bairro** para entrega\n3. **Forma de Pagamento** (Pix, Cartão ou Dinheiro).`;
        } else if (lower.includes('pix') || lower.includes('cartao') || lower.includes('cartão') || lower.includes('dinheiro') || lower.includes('rua') || lower.includes('av')) {
          // Mock order checkout simulation
          responseJson.reply = `Perfeito! Confirma o seu pedido de *1x Pizza Calabresa* (R$45.00) mais a entrega?\n\n📍 Entrega no endereço informado.\n💳 Pagamento selecionado.\n\nResponda *"Confirmar"* para finalizar!`;
        } else if (lower.includes('confirmar') || lower.includes('confirma') || lower.includes('quero')) {
          const matchedCalabresa = produtos.find(p => p.nome.toLowerCase().includes('calabresa')) || produtos[0];
          responseJson.action = "place_order";
          responseJson.order_details = {
            items: [
              {
                product_name: matchedCalabresa?.nome || 'Pizza Calabresa',
                quantity: 1,
                observacao: 'Lançado via simulador',
                sabor1: matchedCalabresa?.nome || 'Calabresa',
                sabor2: '',
                adicional: '',
                adicional_preco: 0
              }
            ],
            payment_method: 'Pix',
            customer_name: currentChat.name,
            customer_phone: currentChat.phone,
            customer_address: 'Endereço de Teste do Simulador, 123',
            customer_bairro: taxas[0]?.bairro || 'Centro'
          } as any;
        } else {
          responseJson.reply = `Entendi. Para montarmos o seu pedido ou tirar dúvidas de entrega, você pode escrever o nome do sabor ou perguntar sobre valores. Como prefere continuar?`;
        }

        if (responseJson.action === 'place_order') {
          processDatabaseOrder(responseJson.order_details, chatId);
        } else {
          addMessage(chatId, 'bot', responseJson.reply);
        }
      }, 1500);
      return;
    }

    // 2. If Gemini API Key IS set, run Gemini 2.5 Flash from browser
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: promptText }],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Erro na API do Gemini: ${response.statusText}`);
      }

      const resData = await response.json();
      const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error('Retorno vazio da API do Gemini.');

      // Parse JSON response
      const cleanJsonStr = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
      const result = JSON.parse(cleanJsonStr);

      setIsTyping(false);

      if (result.action === 'place_order' && result.order_details) {
        await processDatabaseOrder(result.order_details, chatId);
      } else {
        addMessage(chatId, 'bot', result.reply || 'Desculpe, tive um problema ao processar a resposta.');
      }

    } catch (e: any) {
      console.error(e);
      setIsTyping(false);
      addMessage(chatId, 'system', `❌ Erro da IA (Gemini): ${e.message || 'Erro ao conectar à API do Gemini.'}`);
      addMessage(chatId, 'bot', 'Desculpe-me, ocorreu uma falha temporária no meu sistema de IA. Pode repetir a mensagem por favor?');
    }
  };

  // Send message as Customer
  const handleSendMessage = () => {
    if (!inputText.trim() || !activeChatId || isTyping) return;

    const messageText = inputText;
    setInputText('');

    // Add customer message
    addMessage(activeChatId, 'customer', messageText);

    const currentChatState = chats.find(c => c.id === activeChatId);
    if (currentChatState) {
      // Simulate Bot processing
      queryAI(activeChatId, currentChatState, messageText);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col bg-[#141414] rounded-2xl border border-essenza-dark-border overflow-hidden">
      {/* Header bar */}
      <div className="p-4 border-b border-essenza-dark-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#1b1b1b]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E50914] flex items-center justify-center">
            <Bot size={22} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">Agente de IA do WhatsApp</h3>
            <p className="text-xs text-neutral-400">Atendimento automático integrado ao banco de dados</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-neutral-900 p-1.5 rounded-xl border border-essenza-dark-border w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('simulator')} 
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === 'simulator' ? 'bg-[#E50914] text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <Smartphone size={14} /> Simulador
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === 'settings' ? 'bg-[#E50914] text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <Settings size={14} /> Configurações
          </button>
          <button 
            onClick={() => setActiveTab('real-connection')} 
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === 'real-connection' ? 'bg-[#E50914] text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <Play size={14} /> WhatsApp Real
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[500px]">
        {activeTab === 'simulator' && (
          <>
            {/* Simulator Sidebar - Chat List */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-essenza-dark-border flex flex-col bg-[#111]">
              <div className="p-3 border-b border-essenza-dark-border flex justify-between items-center">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                  Conversas Ativas
                  {dbLoading && <RefreshCw size={12} className="animate-spin text-[#E50914]" />}
                </span>
                <button 
                  onClick={createNewChat} 
                  className="bg-neutral-800 hover:bg-[#E50914] text-white text-xs px-2.5 py-1.5 rounded-lg border border-essenza-dark-border transition-colors font-medium"
                >
                  Novo Chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-essenza-dark-border/40">
                {chats.length === 0 ? (
                  <p className="text-center text-neutral-500 py-6 text-sm">Nenhuma conversa ativa.</p>
                ) : (
                  chats.map(chat => {
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    const active = chat.id === activeChatId;
                    return (
                      <button 
                        key={chat.id}
                        onClick={() => setActiveChatId(chat.id)}
                        className={`w-full p-4 flex flex-col gap-1 text-left transition-colors ${active ? 'bg-neutral-800/80 border-l-4 border-l-[#E50914]' : 'hover:bg-neutral-900/55'}`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-bold text-white text-sm">{chat.name}</span>
                          <span className="text-[10px] text-neutral-500">
                            {lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400 truncate w-full">
                          {lastMsg ? lastMsg.text : 'Sem mensagens.'}
                        </p>
                        <span className="text-[10px] text-neutral-600 block">{chat.phone}</span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Status info bar */}
              <div className="p-3 border-t border-essenza-dark-border bg-neutral-950 flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Banco de Dados:</span>
                  <span className="text-green-500 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Supabase Conectado
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-neutral-400">Produtos no Cardápio:</span>
                  <span className="text-white font-semibold">{produtos.length} ativos</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Pedidos na Fila de Preparo:</span>
                  <span className="text-amber-500 font-bold">{activeOrdersCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Tempo de Espera:</span>
                  <span className="text-[#FFD700] font-black">{baseWaitTime + (activeOrdersCount * waitTimePerOrder)} min</span>
                </div>
              </div>
            </div>

            {/* Simulator Chat Area */}
            <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden relative">
              {/* Active Chat Header */}
              {activeChat ? (
                <>
                  <div className="px-4 py-3 bg-[#111] border-b border-essenza-dark-border flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-white font-bold text-sm">
                        {activeChat.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{activeChat.name}</h4>
                        <p className="text-[10px] text-neutral-400">{activeChat.phone}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => clearChatHistory(activeChat.id)} 
                      title="Limpar Histórico"
                      className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Chat Bubbles */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col">
                    {activeChat.messages.map((msg) => {
                      if (msg.sender === 'system') {
                        return (
                          <div key={msg.id} className="mx-auto my-1 bg-neutral-900 border border-essenza-dark-border text-neutral-400 text-xs px-3 py-1.5 rounded-lg text-center max-w-[85%]">
                            {msg.text}
                          </div>
                        );
                      }
                      const isCustomer = msg.sender === 'customer';
                      return (
                        <div 
                          key={msg.id} 
                          className={`max-w-[75%] p-3 rounded-2xl flex flex-col ${
                            isCustomer 
                              ? 'bg-neutral-800 text-white rounded-br-none self-end' 
                              : 'bg-gradient-to-br from-neutral-900 to-[#1b1b1b] border border-essenza-dark-border text-neutral-200 rounded-bl-none self-start'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-line leading-relaxed">{msg.text}</p>
                          <span className="text-[9px] text-neutral-500 self-end mt-1">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      );
                    })}

                    {/* Typing Indicator */}
                    {isTyping && (
                      <div className="bg-neutral-900 border border-essenza-dark-border text-neutral-400 rounded-2xl rounded-bl-none max-w-[50%] p-3 self-start flex items-center gap-2">
                        <Sparkles size={14} className="text-[#FFD700] animate-spin" />
                        <span className="text-xs">IA está digitando...</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input area */}
                  <div className="p-3 border-t border-essenza-dark-border bg-[#111] flex gap-2">
                    <input 
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder={isTyping ? "Aguardando resposta da IA..." : "Escreva uma mensagem simulando o cliente..."}
                      disabled={isTyping}
                      className="flex-1 bg-neutral-900 text-white placeholder-neutral-500 border border-essenza-dark-border rounded-xl px-4 py-3 text-sm focus:border-[#E50914] focus:outline-none disabled:opacity-50"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isTyping || !inputText.trim()}
                      className="w-12 h-12 bg-[#E50914] hover:bg-red-600 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-6 text-center">
                  <Smartphone size={48} className="mb-2 text-neutral-600" />
                  <p className="text-sm">Selecione uma conversa ao lado ou clique em "Novo Chat" para iniciar.</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0E0E0E]">
            <div className="flex items-center gap-2 text-white font-bold text-base border-b border-essenza-dark-border pb-2">
              <Settings size={18} className="text-[#E50914]" />
              <span>Configurações do Agente de IA</span>
            </div>

            {/* Warning Alert if no Gemini Key */}
            {!geminiKey && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex gap-3 text-amber-500">
                <AlertTriangle size={24} className="flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-bold">Modo de Teste Simulado Ativo</p>
                  <p className="mt-1 opacity-90">Você não configurou uma chave de API do Gemini. O simulador de chat funcionará no modo de roteiro pré-programado (estático). Para usar a IA de verdade que atende de forma flexível e autônoma, por favor insira a sua chave do Gemini abaixo.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column Settings */}
              <div className="space-y-4">
                <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Key size={16} className="text-[#E50914]" />
                    <span>Autenticação da IA</span>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Chave de API do Gemini (Google AI Studio)</label>
                    <input 
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none"
                    />
                    <span className="text-[10px] text-neutral-500 block mt-1">Crie uma chave gratuita no Google AI Studio.</span>
                  </div>
                </div>

                <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Clock size={16} className="text-[#E50914]" />
                    <span>Lógica de Tempo de Espera</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Espera Base (min)</label>
                      <input 
                        type="number"
                        value={baseWaitTime}
                        onChange={(e) => setBaseWaitTime(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Acréscimo por Pedido (min)</label>
                      <input 
                        type="number"
                        value={waitTimePerOrder}
                        onChange={(e) => setWaitTimePerOrder(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none"
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-neutral-500 block">Fórmula: Espera Base + (Pedidos Preparando × Acréscimo). A IA usará este cálculo para informar aos clientes.</span>
                </div>

                <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Smartphone size={16} className="text-[#E50914]" />
                    <span>Integração com WhatsApp Real</span>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">URL da API do WhatsApp</label>
                    <input 
                      type="text"
                      value={whatsappApiUrl}
                      onChange={(e) => setWhatsappApiUrl(e.target.value)}
                      placeholder="http://localhost:8000"
                      className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Token / Chave de Segurança da API</label>
                    <input 
                      type="password"
                      value={whatsappToken}
                      onChange={(e) => setWhatsappToken(e.target.value)}
                      placeholder="Token de acesso"
                      className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column Settings - System Prompt */}
              <div className="flex flex-col h-full">
                <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 flex-1 flex flex-col gap-2 min-h-[300px]">
                  <div className="flex items-center justify-between text-white font-semibold text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-[#FFD700]" />
                      <span>Instruções do Sistema (Prompt)</span>
                    </div>
                    <button 
                      onClick={() => {
                        if (confirm('Deseja resetar o prompt para o padrão original?')) {
                          localStorage.removeItem('essenza_ia_system_prompt');
                          window.location.reload();
                        }
                      }}
                      className="text-neutral-500 hover:text-red-400 text-xs font-semibold"
                    >
                      Resetar
                    </button>
                  </div>
                  <textarea 
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-essenza-dark-border rounded-xl p-3 text-xs text-neutral-300 focus:border-[#E50914] focus:outline-none font-mono resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={loadDatabaseInfo} 
                className="flex items-center gap-2 border border-essenza-dark-border hover:bg-neutral-900 text-neutral-300 text-sm px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95"
              >
                <RefreshCw size={16} /> Atualizar Catálogo
              </button>
              <button 
                onClick={saveSettings} 
                className="flex items-center gap-2 bg-[#E50914] hover:bg-red-600 text-white text-sm px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-red-950/40"
              >
                <CheckCircle2 size={16} /> Salvar Configurações
              </button>
            </div>
          </div>
        )}

        {activeTab === 'real-connection' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0E0E0E]">
            <div className="flex items-center gap-2 text-white font-bold text-base border-b border-essenza-dark-border pb-2">
              <Smartphone size={18} className="text-[#E50914]" />
              <span>Conectar Atendimento ao WhatsApp de Verdade</span>
            </div>

            <div className="max-w-3xl space-y-4">
              <p className="text-sm text-neutral-300 leading-relaxed">
                Além do simulador no navegador, você pode conectar o robô de IA a um número real de WhatsApp da sua pizzaria. Ele usará as mesmas configurações de prompt, estimativa de tempo e cardápio sincronizados com o Supabase.
              </p>

              <div className="bg-neutral-900 border border-essenza-dark-border rounded-xl p-5 space-y-4">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#E50914] flex items-center justify-center text-xs text-white">1</span>
                  Preparando o Ambiente Local
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Para rodar o robô, já preparamos um script do Node.js completo na pasta do seu projeto. Siga os passos abaixo no terminal do seu computador para ligá-lo.
                </p>
                <div className="bg-black/90 p-4 rounded-lg font-mono text-xs text-green-400 space-y-1.5 border border-neutral-800">
                  <p className="text-neutral-500"># 1. Entre na pasta raiz do projeto no seu terminal</p>
                  <p className="text-neutral-500"># 2. Rode o comando para instalar as dependências e iniciar o bot</p>
                  <p>npm run chatbot</p>
                </div>
              </div>

              <div className="bg-neutral-900 border border-essenza-dark-border rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#E50914] flex items-center justify-center text-xs text-white">2</span>
                  Escaneando o QR Code
                </h4>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Ao rodar o comando acima, um **QR Code** será desenhado no seu terminal de texto.
                </p>
                <ul className="text-xs text-neutral-400 space-y-1.5 list-disc list-inside pl-1">
                  <li>Abra o WhatsApp no celular do estabelecimento.</li>
                  <li>Vá em **Aparelhos Conectados** {'>'} **Conectar um aparelho**.</li>
                  <li>Aponte a câmera para o QR Code gerado no terminal.</li>
                  <li>Pronto! O robô estará ativo e respondendo aos clientes de forma inteligente.</li>
                </ul>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-neutral-300">
                <HelpCircle size={22} className="flex-shrink-0 text-amber-500" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-white mb-1">Como funciona o sincronismo?</p>
                  Sempre que o cardápio for alterado no painel administrativo ou as taxas de entrega forem modificadas no Supabase, o bot de WhatsApp real as recarregará automaticamente a cada atendimento, garantindo informações de preço e sabores sempre atualizados e corretos para o cliente.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
