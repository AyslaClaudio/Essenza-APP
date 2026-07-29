import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Check, AlertCircle, Music, X, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Conversa {
  clienteId: string;
  clienteName: string;
  ultimaMensagem: string;
  status: 'em_conversa' | 'pedido_confirmado';
  pedido: Record<string, any>;
  criadoEm: string;
  ultimaMensagemEm: string;
  totalMensagens: number;
}

interface Mensagem {
  tipo: 'cliente' | 'atendente' | 'sistema';
  texto: string;
  timestamp: string;
}

interface ConversaDetalhes {
  clienteId: string;
  clienteName: string;
  mensagens: Mensagem[];
  pedido: Record<string, any>;
  status: string;
  criadoEm: string;
}

export function WhatsAppPedidos() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selecionada, setSelecionada] = useState<ConversaDetalhes | null>(null);
  const [resposta, setResposta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [notificacaoAtiva, setNotificacaoAtiva] = useState(false);
  const [formPedido, setFormPedido] = useState({
    total: 0,
    taxa_entrega: 0,
    endereco: '',
    bairro: '',
    forma_pagamento: 'dinheiro',
    observacao: ''
  });
  const wsRef = useRef<WebSocket | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  const BACKEND_URL = import.meta.env.VITE_WHATSAPP_BACKEND || 'http://localhost:3001';
  const WS_URL = BACKEND_URL.replace('http', 'ws');

  // Criar elemento de áudio para notificação
  useEffect(() => {
    const audio = new Audio('/notification.mp3');
    notificationAudioRef.current = audio;
  }, []);

  // Conectar ao WebSocket
  useEffect(() => {
    const conectarWS = () => {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('✅ WebSocket conectado');
      };

      ws.onmessage = (event) => {
        const { event: eventType } = JSON.parse(event.data);

        if (eventType === 'nova_mensagem') {
          // Tocar som de notificação
          tocarNotificacao();
          setNotificacaoAtiva(true);
          setTimeout(() => setNotificacaoAtiva(false), 3000);

          // Recarregar conversas
          carregarConversas();
        }

        if (eventType === 'pedido_confirmado') {
          tocarNotificacao();
          carregarConversas();
        }

        if (eventType === 'pedido_atualizado') {
          carregarConversas();
        }
      };

      ws.onerror = (error) => {
        console.error('Erro WebSocket:', error);
      };

      ws.onclose = () => {
        console.log('❌ WebSocket desconectado');
        setTimeout(conectarWS, 3000);
      };

      wsRef.current = ws;
    };

    conectarWS();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  const tocarNotificacao = () => {
    if (notificationAudioRef.current) {
      notificationAudioRef.current.currentTime = 0;
      notificationAudioRef.current.play().catch((e) => console.log('Erro ao tocar áudio:', e));
    } else {
      // Fallback: criar um beep simples usando Web Audio API
      criarBeepSonoro();
    }
  };

  const criarBeepSonoro = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.log('Web Audio API não disponível');
    }
  };

  const carregarConversas = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/conversas`);
      const data = await response.json();
      setConversas(data);
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    }
  }, [BACKEND_URL]);

  const carregarConversa = useCallback(
    async (clienteId: string) => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/conversas/${clienteId}`);
        const data = await response.json();
        setSelecionada(data);
      } catch (error) {
        console.error('Erro ao carregar conversa:', error);
      }
    },
    [BACKEND_URL]
  );

  const enviarResposta = async () => {
    if (!resposta.trim() || !selecionada) return;

    setCarregando(true);
    try {
      await fetch(`${BACKEND_URL}/api/responder/${selecionada.clienteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: resposta }),
      });

      setResposta('');
      carregarConversa(selecionada.clienteId);
    } catch (error) {
      console.error('Erro ao enviar resposta:', error);
    } finally {
      setCarregando(false);
    }
  };

  const confirmarPedido = async () => {
    if (!selecionada || !formPedido.total) return;

    setCarregando(true);
    try {
      const numeroPedido = Math.floor(Math.random() * 10000);

      const { error: pedidoError } = await supabase
        .from('pedidos')
        .insert([
          {
            numero: numeroPedido,
            cliente_nome: selecionada.clienteName,
            cliente_telefone: selecionada.clienteId,
            cliente_endereco: formPedido.endereco || 'Não informado',
            cliente_bairro: formPedido.bairro || 'Não informado',
            tipo: 'delivery',
            status: 'confirmado',
            subtotal: formPedido.total,
            taxa_entrega: formPedido.taxa_entrega,
            desconto: 0,
            total: formPedido.total + formPedido.taxa_entrega,
            custo_total: 0,
            lucro: 0,
            forma_pagamento: formPedido.forma_pagamento,
            observacao: formPedido.observacao || JSON.stringify(selecionada.pedido),
            cupom: '',
            avaliacao: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            whatsapp_conversa_id: selecionada.clienteId,
          },
        ])
        .select();

      if (pedidoError) throw pedidoError;

      // Notificar cliente via WhatsApp
      await fetch(`${BACKEND_URL}/api/responder/${selecionada.clienteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: `✅ Pedido #${numeroPedido} confirmado!\n\nTotal: R$ ${(formPedido.total + formPedido.taxa_entrega).toFixed(2)}\nEndereço: ${formPedido.endereco}\n\nEstaremos preparando seu pedido. Você receberá atualizações em breve!`
        }),
      });

      tocarNotificacao();
      setShowModal(false);
      setFormPedido({ total: 0, taxa_entrega: 0, endereco: '', bairro: '', forma_pagamento: 'dinheiro', observacao: '' });
      carregarConversas();
    } catch (error) {
      console.error('Erro ao confirmar pedido:', error);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarConversas();
    const interval = setInterval(carregarConversas, 10000);
    return () => clearInterval(interval);
  }, [carregarConversas]);

  return (
    <div className="h-full flex bg-gray-50">
      {/* Lista de Conversas */}
      <div className="w-80 border-r bg-white overflow-y-auto">
        <div className="p-4 border-b bg-gradient-to-r from-green-600 to-green-700">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-6 h-6 text-neutral-900" />
            <h1 className="text-xl font-bold text-neutral-900">Pedidos WhatsApp</h1>
          </div>

          <div className="text-sm text-green-100">
            {conversas.length} conversa{conversas.length !== 1 ? 's' : ''} ativa{conversas.length !== 1 ? 's' : ''}
          </div>
        </div>

        {notificacaoAtiva && (
          <div className="m-2 p-2 bg-green-100 border border-green-400 rounded flex items-center gap-2">
            <Music className="w-4 h-4 text-green-600 animate-bounce" />
            <span className="text-sm text-green-700">Nova mensagem! 🔔</span>
          </div>
        )}

        <div className="divide-y">
          {conversas.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma conversa ativa</p>
            </div>
          ) : (
            conversas.map((conversa) => (
              <button
                key={conversa.clienteId}
                onClick={() => carregarConversa(conversa.clienteId)}
                className={`w-full p-4 text-left hover:bg-green-50 transition ${
                  selecionada?.clienteId === conversa.clienteId ? 'bg-green-50 border-l-4 border-green-600' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-semibold text-gray-900">{conversa.clienteName}</h3>
                  <Phone className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-sm text-gray-600 truncate">{conversa.ultimaMensagem}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">{conversa.totalMensagens} msg</span>
                  {conversa.status === 'pedido_confirmado' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">✓ Confirmado</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detalhes da Conversa */}
      <div className="flex-1 flex flex-col">
        {selecionada ? (
          <>
            {/* Header */}
            <div className="bg-white border-b p-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selecionada.clienteName}</h2>
                <p className="text-sm text-gray-600">WhatsApp • {selecionada.clienteId}</p>
              </div>
              {selecionada.status === 'pedido_confirmado' && (
                <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Pedido Confirmado
                </div>
              )}
            </div>

            {/* Informações do Pedido */}
            {Object.keys(selecionada.pedido).length > 0 && (
              <div className="bg-blue-50 border-b border-blue-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  Informações do Pedido
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(selecionada.pedido).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-gray-600">{key}:</span>
                      <span className="font-medium text-gray-900 ml-1">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histórico de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selecionada.mensagens.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.tipo === 'cliente' ? 'justify-start' : msg.tipo === 'atendente' ? 'justify-end' : 'justify-center'
                  }`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.tipo === 'cliente'
                        ? 'bg-gray-200 text-gray-900'
                        : msg.tipo === 'atendente'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-600 text-sm'
                    }`}
                  >
                    <p>{msg.texto}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Campo de Resposta */}
            {selecionada.status !== 'pedido_confirmado' && (
              <div className="bg-white border-t p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && enviarResposta()}
                    placeholder="Digitar resposta..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600"
                    disabled={carregando}
                  />
                  <button
                    onClick={enviarResposta}
                    disabled={!resposta.trim() || carregando}
                    className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={() => setShowModal(true)}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                  disabled={carregando}
                >
                  ✓ Confirmar Pedido
                </button>
              </div>
            )}

            {/* Modal de Confirmação */}
            {showModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 my-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Confirmar Pedido #{selecionada.clienteId.slice(-4)}</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="bg-blue-50 p-3 rounded-lg mb-4 text-sm text-blue-800">
                    <p className="font-semibold">{selecionada.clienteName}</p>
                    <p>{selecionada.clienteId}</p>
                  </div>

                  {/* Informações do Pedido */}
                  <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
                    <h4 className="font-semibold text-gray-900 mb-2">Resumo do Pedido:</h4>
                    <div className="text-gray-600 space-y-1">
                      {Object.entries(selecionada.pedido).map(([key, value]) => (
                        <p key={key}><span className="font-medium">{key}:</span> {String(value)}</p>
                      ))}
                    </div>
                  </div>

                  {/* Formulário */}
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Total (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formPedido.total}
                        onChange={(e) => setFormPedido({...formPedido, total: parseFloat(e.target.value) || 0})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-600 focus:border-transparent"
                        placeholder="0.00"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Entrega (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formPedido.taxa_entrega}
                        onChange={(e) => setFormPedido({...formPedido, taxa_entrega: parseFloat(e.target.value) || 0})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-600 focus:border-transparent"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                      <input
                        type="text"
                        value={formPedido.endereco}
                        onChange={(e) => setFormPedido({...formPedido, endereco: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-600 focus:border-transparent"
                        placeholder="Rua das Flores, 123"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                      <input
                        type="text"
                        value={formPedido.bairro}
                        onChange={(e) => setFormPedido({...formPedido, bairro: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-600 focus:border-transparent"
                        placeholder="Centro"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
                      <select
                        value={formPedido.forma_pagamento}
                        onChange={(e) => setFormPedido({...formPedido, forma_pagamento: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-600 focus:border-transparent"
                      >
                        <option value="dinheiro">Dinheiro</option>
                        <option value="cartao_credito">Cartão Crédito</option>
                        <option value="cartao_debito">Cartão Débito</option>
                        <option value="pix">PIX</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                      <textarea
                        value={formPedido.observacao}
                        onChange={(e) => setFormPedido({...formPedido, observacao: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-600 focus:border-transparent"
                        placeholder="Sem cebola, sem azeite, etc"
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 bg-gray-300 text-gray-900 py-2 rounded-lg hover:bg-gray-400 transition font-medium"
                      disabled={carregando}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarPedido}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={carregando || !formPedido.total}
                    >
                      {carregando ? 'Processando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
