import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfig } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { brl } from '../../lib/format';
import type { Configuracao, Impressora, TaxaEntrega, Promocao } from '../../types';
import { todayISO } from '../../lib/format';
import { dateToISO, addDays } from '../../lib/dateUtils';
import { Store, Printer, Truck, Tag, Users, Plus, Pencil, Trash2, Save, Clock, Palette, UserCog, Bell, Star, Bluetooth, BluetoothConnected } from 'lucide-react';
import { conectarImpressora, desconectarImpressora, impressoraConectada, nomeImpressora, suportado as bluetoothSuportado, imprimirViaBluetooth, ultimoErroImpressao } from '../../lib/bluetoothPrinter';

type Tab = 'loja' | 'impressoras' | 'entrega' | 'promocoes' | 'usuarios' | 'marketing';

export function Configuracoes() {
  const [tab, setTab] = useState<Tab>('loja');

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-2xl font-bold text-neutral-900">Configurações</h2>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'loja', label: 'Loja', icon: Store },
          { id: 'impressoras', label: 'Impressoras', icon: Printer },
          { id: 'entrega', label: 'Entrega', icon: Truck },
          { id: 'promocoes', label: 'Promoções', icon: Tag },
          { id: 'usuarios', label: 'Usuários', icon: Users },
          { id: 'marketing', label: 'Marketing', icon: Bell },
        ] as { id: Tab; label: string; icon: typeof Store }[]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-[#E50914] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'loja' && <ConfigLoja />}
      {tab === 'impressoras' && <ConfigImpressoras />}
      {tab === 'entrega' && <ConfigEntrega />}
      {tab === 'promocoes' && <ConfigPromocoes />}
      {tab === 'usuarios' && <ConfigUsuarios />}
      {tab === 'marketing' && <ConfigMarketing />}
    </div>
  );
}

function ConfigLoja() {
  const { config, refresh } = useConfig();
  const [form, setForm] = useState<Partial<Configuracao>>(config || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(config || {}); }, [config]);

  const save = async () => {
    setSaving(true);
    if (config?.id) {
      await supabase.from('configuracoes').update({ ...form, updated_at: new Date().toISOString() }).eq('id', config.id);
    } else {
      await supabase.from('configuracoes').insert(form);
    }
    await refresh();
    setSaving(false);
  };

  const set = (key: keyof Configuracao, value: string | number | boolean) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2"><Store size={20} className="text-[#E50914]" /><h3 className="text-neutral-900 font-semibold">Dados da Loja</h3></div>
        <Field label="Nome da Loja" value={form.nome_loja || ''} onChange={(v) => set('nome_loja', v)} />
        <Field label="Telefone" value={form.telefone_loja || ''} onChange={(v) => set('telefone_loja', v)} />
        <Field label="Endereço" value={form.endereco_loja || ''} onChange={(v) => set('endereco_loja', v)} />
        <Field label="Logo (URL)" value={form.logo || ''} onChange={(v) => set('logo', v)} />
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2"><Clock size={20} className="text-[#E50914]" /><h3 className="text-neutral-900 font-semibold">Horário</h3></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Abertura" value={form.horario_abertura || ''} onChange={(v) => set('horario_abertura', v)} />
          <Field label="Fechamento" value={form.horario_fechamento || ''} onChange={(v) => set('horario_fechamento', v)} />
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2"><Palette size={20} className="text-[#E50914]" /><h3 className="text-neutral-900 font-semibold">Cores</h3></div>
        <div className="grid grid-cols-3 gap-3">
          <ColorField label="Primária" value={form.cor_primaria || '#E50914'} onChange={(v) => set('cor_primaria', v)} />
          <ColorField label="Fundo" value={form.cor_fundo || '#0A0A0A'} onChange={(v) => set('cor_fundo', v)} />
          <ColorField label="Lucro" value={form.cor_lucro || '#22c55e'} onChange={(v) => set('cor_lucro', v)} />
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2"><UserCog size={20} className="text-[#E50914]" /><h3 className="text-neutral-900 font-semibold">Financeiro & Segurança</h3></div>
        <Field label="Taxa Fixa de Entrega (R$)" value={String(form.taxa_fixa_entrega ?? '')} onChange={(v) => set('taxa_fixa_entrega', parseFloat(v) || 0)} type="number" />
        <Field label="Despesas Fixas Diárias (R$)" value={String(form.despesas_fixas_diaria ?? '')} onChange={(v) => set('despesas_fixas_diaria', parseFloat(v) || 0)} type="number" />
        <Field label="Meta Diária (R$)" value={String(form.meta_diaria ?? '')} onChange={(v) => set('meta_diaria', parseFloat(v) || 0)} type="number" />
        <Field label="Senha da Tabela v12" value={form.senha_tabela || ''} onChange={(v) => set('senha_tabela', v)} />
        <label className="flex items-center gap-2 text-neutral-700 text-sm">
          <input type="checkbox" checked={form.tabela_bloqueada ?? false} onChange={(e) => set('tabela_bloqueada', e.target.checked)} className="w-4 h-4 accent-[#E50914]" />
          Bloquear edição da Tabela v12
        </label>
      </div>

      <button onClick={save} disabled={saving} className="w-full bg-[#E50914] text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
      </button>
    </div>
  );
}

function ConfigImpressoraBluetooth() {
  const [conectando, setConectando] = useState(false);
  const [conectada, setConectada] = useState(impressoraConectada());
  const [nome, setNome] = useState(nomeImpressora());
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

  const conectar = async () => {
    setConectando(true);
    setErro(null);
    const res = await conectarImpressora();
    if (res.ok) {
      setConectada(true);
      setNome(res.nome);
    } else {
      setErro(res.erro);
      setConectada(false);
    }
    setConectando(false);
  };

  const desconectar = () => {
    desconectarImpressora();
    setConectada(false);
    setNome(null);
  };

  const testar = async () => {
    setTestando(true);
    setErro(null);
    try {
      const ESC = '\x1B';
      const texto = `${ESC}@${ESC}a\x01${ESC}E\x01ESSENZA${ESC}E\x00\n${ESC}a\x01Teste de impressao Bluetooth\n${ESC}a\x00--------------------------------\nSe voce esta lendo isso,\na impressora esta conectada\ncorretamente. \n\n\n`;
      const ok = await imprimirViaBluetooth(texto);
      if (!ok) {
        setErro('Não foi possível enviar o teste: ' + (ultimoErroImpressao() || 'a impressora pode ter desconectado.'));
        setConectada(impressoraConectada());
      }
    } catch (e) {
      setErro('Não foi possível enviar o teste: ' + ((e as Error).message || 'erro desconhecido.'));
      setConectada(impressoraConectada());
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Bluetooth size={20} className="text-[#E50914]" />
        <h3 className="text-neutral-900 font-semibold">Impressora Bluetooth (58mm/80mm)</h3>
      </div>
      <p className="text-neutral-500 text-sm">
        Conecta direto no navegador via Bluetooth — sem precisar de driver. Funciona só em Chrome/Edge (Android, Windows, Mac ou Linux); não funciona no Safari/iPhone.
        Algumas impressoras baratas usam Bluetooth clássico (SPP), que o navegador não consegue acessar — se a conexão falhar dizendo que não achou canal de impressão, é esse o caso, e só um app Android nativo resolve.
      </p>

      {conectada && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <BluetoothConnected size={18} className="text-green-600" />
          <span className="text-green-700 text-sm font-medium flex-1">Conectada: {nome || 'Impressora'}</span>
        </div>
      )}
      {erro && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{erro}</p>}

      {!bluetoothSuportado() && (
        <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Este navegador não suporta Web Bluetooth. Abra o painel no Chrome ou Edge.
        </p>
      )}

      <div className="flex gap-2">
        {conectada ? (
          <>
            <button onClick={testar} disabled={testando} className="flex-1 flex items-center justify-center gap-2 bg-neutral-200 text-neutral-900 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
              <Printer size={16} /> {testando ? 'Enviando...' : 'Testar Impressão'}
            </button>
            <button onClick={desconectar} className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold text-sm">Desconectar</button>
          </>
        ) : (
          <button onClick={conectar} disabled={conectando || !bluetoothSuportado()} className="w-full flex items-center justify-center gap-2 bg-[#E50914] text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
            <Bluetooth size={16} /> {conectando ? 'Procurando...' : 'Conectar Impressora'}
          </button>
        )}
      </div>
    </div>
  );
}

function ConfigImpressoras() {
  const [impressoras, setImpressoras] = useState<Impressora[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Impressora | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('impressoras').select('*').order('funcao');
    setImpressoras((data as Impressora[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (confirm('Excluir impressora?')) { await supabase.from('impressoras').delete().eq('id', id); load(); }
  };

  return (
    <div className="space-y-4">
      <ConfigImpressoraBluetooth />

      <div className="flex items-center justify-between">
        <p className="text-neutral-500 text-sm">Cadastre até 3 impressoras de bobina 80mm. Defina qual imprime Cozinha, Caixa e Entrega.</p>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-[#E50914] text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <Plus size={18} /> Nova
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {impressoras.map((imp) => (
          <div key={imp.id} className="bg-white border border-neutral-200 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-2">
              <Printer size={24} className="text-[#E50914]" />
              <div className="flex gap-1">
                <button onClick={() => { setEditing(imp); setShowForm(true); }} className="p-1 text-neutral-500 hover:text-neutral-900"><Pencil size={14} /></button>
                <button onClick={() => remove(imp.id)} className="p-1 text-neutral-500 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-neutral-900 font-medium">{imp.nome}</p>
            <p className="text-neutral-500 text-sm">{imp.modelo || 'Sem modelo'}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 bg-neutral-200 rounded-full text-neutral-700 capitalize">{imp.funcao}</span>
              <span className="text-xs px-2 py-0.5 bg-neutral-200 rounded-full text-neutral-700 capitalize">{imp.tipo}</span>
              {imp.ativa ? <span className="text-xs px-2 py-0.5 bg-green-500/20 rounded-full text-green-600">Ativa</span> : <span className="text-xs px-2 py-0.5 bg-red-500/20 rounded-full text-red-600">Inativa</span>}
            </div>
          </div>
        ))}
        {impressoras.length === 0 && <p className="col-span-full text-center text-neutral-500 py-6">Nenhuma impressora cadastrada</p>}
      </div>

      {showForm && <ImpressoraForm impressora={editing} onClose={() => setShowForm(false)} onSave={async () => { setShowForm(false); await load(); }} />}
    </div>
  );
}

function ImpressoraForm({ impressora, onClose, onSave }: { impressora: Impressora | null; onClose: () => void; onSave: () => void }) {
  const [nome, setNome] = useState(impressora?.nome || '');
  const [tipo, setTipo] = useState<Impressora['tipo']>(impressora?.tipo || 'usb');
  const [modelo, setModelo] = useState(impressora?.modelo || '');
  const [funcao, setFuncao] = useState<Impressora['funcao']>(impressora?.funcao || 'cozinha');
  const [ip, setIp] = useState(impressora?.ip || '');
  const [porta, setPorta] = useState(impressora?.porta || '9100');
  const [ativa, setAtiva] = useState(impressora?.ativa ?? true);

  const save = async () => {
    const data = { nome, tipo, modelo, funcao, ip, porta, ativa };
    if (impressora) await supabase.from('impressoras').update(data).eq('id', impressora.id);
    else await supabase.from('impressoras').insert(data);
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-neutral-900 font-bold text-lg mb-4">{impressora ? 'Editar' : 'Nova'} Impressora</h3>
        <div className="space-y-3">
          <Field label="Nome" value={nome} onChange={setNome} />
          <div>
            <label className="text-neutral-500 text-sm">Tipo de Conexão</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Impressora['tipo'])} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1">
              <option value="usb">USB</option><option value="rede">Rede</option><option value="bluetooth">Bluetooth</option>
            </select>
          </div>
          <Field label="Modelo (Elgin, Bematech, Epson...)" value={modelo} onChange={setModelo} />
          <div>
            <label className="text-neutral-500 text-sm">Função</label>
            <select value={funcao} onChange={(e) => setFuncao(e.target.value as Impressora['funcao'])} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1">
              <option value="cozinha">Cozinha</option><option value="caixa">Caixa</option><option value="entrega">Entrega</option>
            </select>
          </div>
          {tipo === 'rede' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="IP" value={ip} onChange={setIp} />
              <Field label="Porta" value={porta} onChange={setPorta} />
            </div>
          )}
          <label className="flex items-center gap-2 text-neutral-700 text-sm">
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="w-4 h-4 accent-[#E50914]" /> Ativa
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
          <button onClick={save} disabled={!nome} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ConfigEntrega() {
  const [taxas, setTaxas] = useState<TaxaEntrega[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxaEntrega | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('taxa_entrega').select('*').order('bairro');
    setTaxas((data as TaxaEntrega[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (confirm('Excluir taxa?')) { await supabase.from('taxa_entrega').delete().eq('id', id); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-neutral-500 text-sm">Taxas de entrega por bairro/CEP</p>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-[#E50914] text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <Plus size={18} /> Nova
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {taxas.map((t) => (
          <div key={t.id} className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-neutral-900 font-medium">{t.bairro}</p>
              <p className="text-[#22c55e] font-bold">{brl(t.taxa)}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setEditing(t); setShowForm(true); }} className="p-1.5 text-neutral-500 hover:text-neutral-900"><Pencil size={16} /></button>
              <button onClick={() => remove(t.id)} className="p-1.5 text-neutral-500 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
      {showForm && <TaxaForm taxa={editing} onClose={() => setShowForm(false)} onSave={async () => { setShowForm(false); await load(); }} />}
    </div>
  );
}

function TaxaForm({ taxa, onClose, onSave }: { taxa: TaxaEntrega | null; onClose: () => void; onSave: () => void }) {
  const [bairro, setBairro] = useState(taxa?.bairro || '');
  const [cep, setCep] = useState(taxa?.cep || '');
  const [taxaVal, setTaxaVal] = useState(String(taxa?.taxa ?? ''));

  const save = async () => {
    const data = { bairro, cep, taxa: parseFloat(taxaVal) || 0, ativo: true };
    if (taxa) await supabase.from('taxa_entrega').update(data).eq('id', taxa.id);
    else await supabase.from('taxa_entrega').insert(data);
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-neutral-900 font-bold text-lg mb-4">{taxa ? 'Editar' : 'Nova'} Taxa</h3>
        <div className="space-y-3">
          <Field label="Bairro" value={bairro} onChange={setBairro} />
          <Field label="CEP (opcional)" value={cep} onChange={setCep} />
          <Field label="Taxa (R$)" value={taxaVal} onChange={setTaxaVal} type="number" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
          <button onClick={save} disabled={!bairro} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ConfigPromocoes() {
  const [promos, setPromos] = useState<Promocao[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Promocao | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('promocoes').select('*').order('data_inicio', { ascending: false });
    setPromos((data as Promocao[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (confirm('Excluir promoção?')) { await supabase.from('promocoes').delete().eq('id', id); load(); }
  };

  const toggle = async (p: Promocao) => {
    await supabase.from('promocoes').update({ ativo: !p.ativo }).eq('id', p.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-neutral-500 text-sm">Promoções e Combos</p>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-[#E50914] text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <Plus size={18} /> Nova
        </button>
      </div>
      <div className="space-y-3">
        {promos.map((p) => (
          <div key={p.id} className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-neutral-900 font-medium">{p.nome}</p>
              <p className="text-neutral-500 text-sm">{p.itens}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[#22c55e] font-semibold text-sm">{brl(p.preco)}</span>
                <span className="text-neutral-500 text-xs">{p.data_inicio} a {p.data_fim}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(p)} className={`px-3 py-1 rounded-full text-xs font-medium ${p.ativo ? 'bg-green-500/20 text-green-600' : 'bg-neutral-700 text-neutral-500'}`}>
                {p.ativo ? 'Ativa' : 'Inativa'}
              </button>
              <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 text-neutral-500 hover:text-neutral-900"><Pencil size={16} /></button>
              <button onClick={() => remove(p.id)} className="p-1.5 text-neutral-500 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {promos.length === 0 && <p className="text-center text-neutral-500 py-6">Nenhuma promoção cadastrada</p>}
      </div>
      {showForm && <PromoForm promo={editing} onClose={() => setShowForm(false)} onSave={async () => { setShowForm(false); await load(); }} />}
    </div>
  );
}

function PromoForm({ promo, onClose, onSave }: { promo: Promocao | null; onClose: () => void; onSave: () => void }) {
  const [nome, setNome] = useState(promo?.nome || '');
  const [itens, setItens] = useState(promo?.itens || '');
  const [preco, setPreco] = useState(String(promo?.preco ?? ''));
  const [custo, setCusto] = useState(String(promo?.custo ?? ''));
  const [dataInicio, setDataInicio] = useState(promo?.data_inicio || todayISO());
  const [dataFim, setDataFim] = useState(promo?.data_fim || dateToISO(addDays(new Date(), 30)));

  const save = async () => {
    const data = { nome, itens, preco: parseFloat(preco) || 0, custo: parseFloat(custo) || 0, data_inicio: dataInicio, data_fim: dataFim, ativo: true };
    if (promo) await supabase.from('promocoes').update(data).eq('id', promo.id);
    else await supabase.from('promocoes').insert(data);
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-neutral-900 font-bold text-lg mb-4">{promo ? 'Editar' : 'Nova'} Promoção</h3>
        <div className="space-y-3">
          <Field label="Nome" value={nome} onChange={setNome} />
          <Field label="Itens incluídos" value={itens} onChange={setItens} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço (R$)" value={preco} onChange={setPreco} type="number" />
            <Field label="Custo (R$)" value={custo} onChange={setCusto} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" value={dataInicio} onChange={setDataInicio} type="date" />
            <Field label="Fim" value={dataFim} onChange={setDataFim} type="date" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
          <button onClick={save} disabled={!nome} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ConfigUsuarios() {
  const { usuario } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'atendente' | 'caixa' | 'gerente'>('atendente');
  const [users, setUsers] = useState<{ id: string; nome: string; role: string; ativo: boolean }[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('id, nome, role, ativo').order('nome');
    setUsers((data as typeof users) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    if (!email || !password || !nome) return;
    // O app só tem a chave anon (sem service role), então auth.admin.createUser
    // sempre falha aqui — o fallback é signUp(), que troca a sessão ativa pra do
    // usuário recém-criado. Sem restaurar a sessão do gerente logo em seguida,
    // ele seria deslogado da própria conta ao criar um funcionário novo.
    const { data: sessionData } = await supabase.auth.getSession();
    const gerenteSession = sessionData.session;

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr || !signUpData.user) { alert('Erro: ' + (signUpErr?.message || 'desconhecido')); return; }
    await supabase.from('usuarios').insert({ user_id: signUpData.user.id, nome, role });

    if (gerenteSession) {
      await supabase.auth.setSession({
        access_token: gerenteSession.access_token,
        refresh_token: gerenteSession.refresh_token,
      });
    }

    setNome(''); setEmail(''); setPassword(''); setRole('atendente'); setShowForm(false);
    load();
  };

  const removeUser = async (id: string) => {
    if (confirm('Desativar usuário?')) {
      await supabase.from('usuarios').update({ ativo: false }).eq('id', id);
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-neutral-500 text-sm">Usuários do sistema (não visível para clientes)</p>
        {usuario?.role === 'gerente' && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-[#E50914] text-white px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={18} /> Novo Usuário
          </button>
        )}
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#E50914]/20 flex items-center justify-center text-[#E50914] font-bold">
                {u.nome.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-neutral-900 font-medium">{u.nome}</p>
                <p className="text-neutral-500 text-sm capitalize">{u.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {u.ativo ? <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-600 rounded-full">Ativo</span> : <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-600 rounded-full">Inativo</span>}
              {usuario?.role === 'gerente' && <button onClick={() => removeUser(u.id)} className="p-1.5 text-neutral-500 hover:text-red-600"><Trash2 size={16} /></button>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-neutral-900 font-bold text-lg mb-4">Novo Usuário</h3>
            <div className="space-y-3">
              <Field label="Nome" value={nome} onChange={setNome} />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Senha" value={password} onChange={setPassword} type="password" />
              <div>
                <label className="text-neutral-500 text-sm">Nível de Acesso</label>
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1">
                  <option value="atendente">Atendente</option><option value="caixa">Caixa</option><option value="gerente">Gerente</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-200 text-neutral-500 rounded-xl">Cancelar</button>
              <button onClick={createUser} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigMarketing() {
  const { config, refresh } = useConfig();
  const [pushMsg, setPushMsg] = useState('');
  const [sent, setSent] = useState(false);

  const sendPush = () => {
    // Placeholder for push notification - would integrate with WhatsApp/Push API
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Push notification */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2"><Bell size={20} className="text-[#E50914]" /><h3 className="text-neutral-900 font-semibold">Notificação Push</h3></div>
        <textarea value={pushMsg} onChange={(e) => setPushMsg(e.target.value)} placeholder="Ex: Quarta da Pizza: 2 Grandes R$79,90" className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 text-neutral-900 min-h-[80px] focus:border-[#E50914] focus:outline-none" />
        <button onClick={sendPush} disabled={!pushMsg} className="w-full bg-[#E50914] text-white py-3 rounded-xl font-semibold disabled:opacity-50">
          {sent ? 'Enviado!' : 'Enviar Notificação'}
        </button>
        <p className="text-neutral-500 text-xs">Integração com WhatsApp e Push API disponível para o futuro.</p>
      </div>

      {/* Fidelidade */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2"><Star size={20} className="text-[#22c55e]" /><h3 className="text-neutral-900 font-semibold">Programa de Fidelidade</h3></div>
        <label className="flex items-center gap-2 text-neutral-700 text-sm">
          <input type="checkbox" checked={config?.fidelidade_ativo ?? false} onChange={async (e) => {
            if (config?.id) { await supabase.from('configuracoes').update({ fidelidade_ativo: e.target.checked }).eq('id', config.id); refresh(); }
          }} className="w-4 h-4 accent-[#E50914]" /> Ativar programa de fidelidade
        </label>
        <Field label="Regras" value={config?.fidelidade_regras || ''} onChange={async (v) => {
          if (config?.id) { await supabase.from('configuracoes').update({ fidelidade_regras: v }).eq('id', config.id); refresh(); }
        }} />
      </div>

      {/* Avaliações */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2"><Star size={20} className="text-[#22c55e]" /><h3 className="text-neutral-900 font-semibold">Avaliações de Clientes</h3></div>
        <p className="text-neutral-500 text-sm">Após o status "Entregue", o cliente recebe um link para avaliar com 1-5 estrelas. As avaliações aparecem no painel de pedidos.</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-neutral-500 text-sm">{label}</label>
      <input type={type} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 text-neutral-900 mt-1 focus:border-[#E50914] focus:outline-none" />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-neutral-500 text-sm">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-12 h-10 rounded-lg bg-neutral-100 border border-neutral-200 cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-2.5 text-neutral-900 text-sm focus:border-[#E50914] focus:outline-none" />
      </div>
    </div>
  );
}
