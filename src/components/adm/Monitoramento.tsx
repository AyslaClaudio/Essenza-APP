import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Radio, AlertTriangle, UserCog, Bot, ThumbsUp, ThumbsDown, Send,
  BookOpen, Plus, Trash2, CheckCircle2, RefreshCw, MessagesSquare
} from 'lucide-react';
import type { IaConversa, IaMensagem, IaConhecimento } from '../../types';

export function Monitoramento() {
  const [tab, setTab] = useState<'conversas' | 'conhecimento'>('conversas');

  return (
    <div className="min-h-[80vh] flex flex-col bg-[#141414] rounded-2xl border border-essenza-dark-border overflow-hidden">
      <div className="p-4 border-b border-essenza-dark-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#1b1b1b]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E50914] flex items-center justify-center">
            <Radio size={22} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">Monitoramento do Agente de IA</h3>
            <p className="text-xs text-neutral-400">Acompanhe conversas reais do WhatsApp em tempo real</p>
          </div>
        </div>
        <div className="flex bg-neutral-900 p-1.5 rounded-xl border border-essenza-dark-border w-full sm:w-auto">
          <button
            onClick={() => setTab('conversas')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'conversas' ? 'bg-[#E50914] text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <MessagesSquare size={14} /> Conversas
          </button>
          <button
            onClick={() => setTab('conhecimento')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'conhecimento' ? 'bg-[#E50914] text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <BookOpen size={14} /> Base de Conhecimento
          </button>
        </div>
      </div>

      {tab === 'conversas' ? <ConversasPanel /> : <ConhecimentoPanel />}
    </div>
  );
}

function statusBadge(conversa: IaConversa) {
  if (conversa.precisa_atencao) return { label: 'Precisa Atenção', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  if (conversa.status === 'humano') return { label: 'Atendente Humano', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
  if (conversa.status === 'resolvida') return { label: 'Resolvida', className: 'bg-neutral-700/40 text-neutral-400 border-neutral-600/40' };
  return { label: 'IA Atendendo', className: 'bg-green-500/15 text-green-400 border-green-500/30' };
}

function ConversasPanel() {
  const [conversas, setConversas] = useState<IaConversa[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [mensagens, setMensagens] = useState<IaMensagem[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversas = useCallback(async () => {
    const { data } = await supabase
      .from('ia_conversas')
      .select('*')
      .order('precisa_atencao', { ascending: false })
      .order('last_message_at', { ascending: false })
      .limit(50);
    setConversas((data as IaConversa[]) || []);
  }, []);

  useEffect(() => {
    loadConversas();
    const channel = supabase
      .channel('ia_conversas_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ia_conversas' }, () => loadConversas())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConversas]);

  const loadMensagens = useCallback(async (conversaId: string) => {
    const { data } = await supabase
      .from('ia_mensagens')
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true });
    setMensagens((data as IaMensagem[]) || []);
  }, []);

  useEffect(() => {
    if (!activeId) { setMensagens([]); return; }
    loadMensagens(activeId);
    const channel = supabase
      .channel(`ia_mensagens_${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ia_mensagens', filter: `conversa_id=eq.${activeId}` }, () => loadMensagens(activeId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadMensagens]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const activeConversa = conversas.find(c => c.id === activeId);

  const tomarPosse = async () => {
    if (!activeId) return;
    await supabase.from('ia_conversas').update({ status: 'humano' }).eq('id', activeId);
    await supabase.from('ia_mensagens').insert({ conversa_id: activeId, remetente: 'sistema', texto: 'Atendente humano assumiu esta conversa.', enviado: true });
  };

  const devolverParaIA = async () => {
    if (!activeId) return;
    await supabase.from('ia_conversas').update({ status: 'ia', precisa_atencao: false, motivo_atencao: '' }).eq('id', activeId);
    await supabase.from('ia_mensagens').insert({ conversa_id: activeId, remetente: 'sistema', texto: 'Conversa devolvida para a IA.', enviado: true });
  };

  const marcarResolvida = async () => {
    if (!activeId) return;
    await supabase.from('ia_conversas').update({ status: 'resolvida', precisa_atencao: false }).eq('id', activeId);
  };

  const enviarComoHumano = async () => {
    if (!inputText.trim() || !activeId || !activeConversa) return;
    setSending(true);
    await supabase.from('ia_mensagens').insert({
      conversa_id: activeId,
      remetente: 'humano',
      texto: inputText,
      // Simulator has no real transport — mark as already delivered.
      // Real WhatsApp conversations: the bot polls for enviado=false and dispatches + marks true.
      enviado: activeConversa.canal !== 'whatsapp'
    });
    await supabase.from('ia_conversas').update({ last_message_at: new Date().toISOString() }).eq('id', activeId);
    setInputText('');
    setSending(false);
  };

  const darFeedback = async (msgId: string, feedback: 'positivo' | 'negativo') => {
    await supabase.from('ia_mensagens').update({ feedback }).eq('id', msgId);
    setMensagens(prev => prev.map(m => m.id === msgId ? { ...m, feedback } : m));
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[500px]">
      {/* Conversation list */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-essenza-dark-border flex flex-col bg-[#111]">
        <div className="p-3 border-b border-essenza-dark-border flex justify-between items-center">
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Conversas Reais (WhatsApp)</span>
          <button onClick={loadConversas} className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-essenza-dark-border/40">
          {conversas.length === 0 ? (
            <p className="text-center text-neutral-500 py-6 text-sm px-4">Nenhuma conversa registrada ainda. Elas aparecem aqui assim que o robô do WhatsApp real (`npm run chatbot`) começar a atender clientes.</p>
          ) : (
            conversas.map(conversa => {
              const badge = statusBadge(conversa);
              const active = conversa.id === activeId;
              return (
                <button
                  key={conversa.id}
                  onClick={() => setActiveId(conversa.id)}
                  className={`w-full p-4 flex flex-col gap-1.5 text-left transition-colors ${active ? 'bg-neutral-800/80 border-l-4 border-l-[#E50914]' : 'hover:bg-neutral-900/55'}`}
                >
                  <div className="flex justify-between items-center w-full gap-2">
                    <span className="font-bold text-white text-sm truncate">{conversa.cliente_nome || conversa.telefone}</span>
                    {conversa.precisa_atencao && <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-block w-fit ${badge.className}`}>{badge.label}</span>
                  <span className="text-[10px] text-neutral-600 block">{conversa.telefone}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Active conversation */}
      <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden relative">
        {activeConversa ? (
          <>
            <div className="px-4 py-3 bg-[#111] border-b border-essenza-dark-border flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
              <div>
                <h4 className="font-bold text-white text-sm">{activeConversa.cliente_nome || 'Cliente'}</h4>
                <p className="text-[10px] text-neutral-400">{activeConversa.telefone}</p>
                {activeConversa.precisa_atencao && (
                  <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle size={11} /> {activeConversa.motivo_atencao || 'Marcada para revisão'}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {activeConversa.status !== 'humano' ? (
                  <button onClick={tomarPosse} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                    <UserCog size={14} /> Tomar Posse
                  </button>
                ) : (
                  <button onClick={devolverParaIA} className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                    <Bot size={14} /> Devolver para IA
                  </button>
                )}
                {activeConversa.status !== 'resolvida' && (
                  <button onClick={marcarResolvida} className="flex items-center gap-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                    <CheckCircle2 size={14} /> Resolvida
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col">
              {mensagens.map(msg => {
                if (msg.remetente === 'sistema') {
                  return (
                    <div key={msg.id} className="mx-auto my-1 bg-neutral-900 border border-essenza-dark-border text-neutral-400 text-xs px-3 py-1.5 rounded-lg text-center max-w-[85%]">
                      {msg.texto}
                    </div>
                  );
                }
                const isCustomer = msg.remetente === 'cliente';
                const isIa = msg.remetente === 'ia';
                return (
                  <div key={msg.id} className={`max-w-[75%] flex flex-col gap-1 ${isCustomer ? 'self-end items-end' : 'self-start items-start'}`}>
                    <div className={`p-3 rounded-2xl ${
                      isCustomer
                        ? 'bg-neutral-800 text-white rounded-br-none'
                        : isIa
                          ? 'bg-gradient-to-br from-neutral-900 to-[#1b1b1b] border border-essenza-dark-border text-neutral-200 rounded-bl-none'
                          : 'bg-blue-950/60 border border-blue-800/50 text-blue-100 rounded-bl-none'
                    }`}>
                      {!isCustomer && (
                        <span className="text-[9px] font-bold uppercase tracking-wide opacity-60 block mb-1">{isIa ? 'IA' : 'Atendente'}</span>
                      )}
                      <p className="text-sm whitespace-pre-line leading-relaxed">{msg.texto}</p>
                    </div>
                    {isIa && (
                      <div className="flex gap-1">
                        <button onClick={() => darFeedback(msg.id, 'positivo')} className={`p-1 rounded ${msg.feedback === 'positivo' ? 'text-green-400' : 'text-neutral-600 hover:text-green-400'}`}>
                          <ThumbsUp size={12} />
                        </button>
                        <button onClick={() => darFeedback(msg.id, 'negativo')} className={`p-1 rounded ${msg.feedback === 'negativo' ? 'text-red-400' : 'text-neutral-600 hover:text-red-400'}`}>
                          <ThumbsDown size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {activeConversa.status === 'humano' && (
              <div className="p-3 border-t border-essenza-dark-border bg-[#111] flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && enviarComoHumano()}
                  placeholder="Responder como atendente humano..."
                  disabled={sending}
                  className="flex-1 bg-neutral-900 text-white placeholder-neutral-500 border border-essenza-dark-border rounded-xl px-4 py-3 text-sm focus:border-[#E50914] focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={enviarComoHumano}
                  disabled={sending || !inputText.trim()}
                  className="w-12 h-12 bg-[#E50914] hover:bg-red-600 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  <Send size={18} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-6 text-center">
            <MessagesSquare size={48} className="mb-2 text-neutral-600" />
            <p className="text-sm max-w-xs">Selecione uma conversa ao lado para ver o histórico e, se precisar, tomar posse do atendimento.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConhecimentoPanel() {
  const [items, setItems] = useState<IaConhecimento[]>([]);
  const [topico, setTopico] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ia_conhecimento').select('*').order('created_at', { ascending: false });
    setItems((data as IaConhecimento[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    if (!topico.trim() || !conteudo.trim()) return;
    setSaving(true);
    await supabase.from('ia_conhecimento').insert({ topico: topico.trim(), conteudo: conteudo.trim(), ativo: true });
    setTopico('');
    setConteudo('');
    setSaving(false);
    load();
  };

  const toggleAtivo = async (item: IaConhecimento) => {
    await supabase.from('ia_conhecimento').update({ ativo: !item.ativo }).eq('id', item.id);
    load();
  };

  const removeItem = async (id: string) => {
    await supabase.from('ia_conhecimento').delete().eq('id', id);
    load();
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0E0E0E]">
      <p className="text-sm text-neutral-400 leading-relaxed max-w-2xl">
        Adicione aqui regras, respostas corretas ou tópicos que a IA deve sempre seguir — por exemplo, uma política de troca, uma promoção específica, ou um assunto que ela deve sempre delegar para um humano. Cada entrada ativa é injetada automaticamente no contexto da IA em toda conversa (simulador e WhatsApp real).
      </p>

      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 space-y-3 max-w-2xl">
        <input
          type="text"
          value={topico}
          onChange={(e) => setTopico(e.target.value)}
          placeholder="Tópico (ex: Política de Troca)"
          className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none"
        />
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Conteúdo / regra / resposta que a IA deve seguir..."
          rows={3}
          className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-3 py-2 text-sm text-white focus:border-[#E50914] focus:outline-none resize-none"
        />
        <button
          onClick={addItem}
          disabled={saving || !topico.trim() || !conteudo.trim()}
          className="flex items-center gap-2 bg-[#E50914] hover:bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-40"
        >
          <Plus size={16} /> Adicionar à Base de Conhecimento
        </button>
      </div>

      <div className="space-y-3 max-w-2xl">
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma entrada cadastrada ainda.</p>
        ) : (
          items.map(item => (
            <div key={item.id} className={`bg-essenza-dark-card border rounded-xl p-4 ${item.ativo ? 'border-essenza-dark-border' : 'border-neutral-800 opacity-50'}`}>
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h4 className="font-bold text-white text-sm">{item.topico}</h4>
                  <p className="text-neutral-400 text-xs mt-1 whitespace-pre-line">{item.conteudo}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleAtivo(item)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${item.ativo ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-neutral-800 text-neutral-500 border-neutral-700'}`}
                  >
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button onClick={() => removeItem(item.id)} className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
