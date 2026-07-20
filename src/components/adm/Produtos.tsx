import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { brl, lucroProduto, margemProduto } from '../../lib/format';
import type { Produto, Categoria, Adicional } from '../../types';
import { Plus, Pencil, Trash2, Search, Lock, Unlock, X, Flame, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';

export function Produtos() {
  const { usuario } = useAuth();
  const { config } = useConfig();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [filtro, setFiltro] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);

  const [locked, setLocked] = useState(config?.tabela_bloqueada ?? false);
  const [unlockModal, setUnlockModal] = useState(false);
  const [senhaInput, setSenhaInput] = useState('');
  const [tab, setTab] = useState<'produtos' | 'adicionais'>('produtos');

  const canEdit = usuario?.role === 'gerente';

  const load = useCallback(async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('produtos').select('*').order('categoria_nome').order('nome'),
      supabase.from('categorias').select('*').order('ordem'),
    ]);
    setProdutos((p as Produto[]) || []);
    setCategorias((c as Categoria[]) || []);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const filtered = produtos.filter((p) => {
    const matchFiltro = p.nome.toLowerCase().includes(filtro.toLowerCase());
    const matchCat = catFiltro === 'todas' || p.categoria_nome === catFiltro;
    return matchFiltro && matchCat;
  });

  const grouped = filtered.reduce((acc, p) => {
    if (!acc[p.categoria_nome]) acc[p.categoria_nome] = [];
    acc[p.categoria_nome].push(p);
    return acc;
  }, {} as Record<string, Produto[]>);

  const handleUnlock = () => {
    if (senhaInput === (config?.senha_tabela || '1234')) {
      setLocked(false);
      setUnlockModal(false);
      setSenhaInput('');
    } else {
      alert('Senha incorreta');
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">Cardápio</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            {locked ? (
              <button
                onClick={() => setUnlockModal(true)}
                className="flex items-center gap-2 bg-neutral-800 text-neutral-300 px-4 py-2 rounded-xl text-sm hover:bg-neutral-700"
              >
                <Lock size={16} /> Tabela Bloqueada
              </button>
            ) : (
              <button
                onClick={() => setLocked(true)}
                className="flex items-center gap-2 bg-neutral-800 text-neutral-300 px-4 py-2 rounded-xl text-sm hover:bg-neutral-700"
              >
                <Unlock size={16} /> Bloquear Tabela
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('produtos')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'produtos' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
        >Produtos</button>
        <button
          onClick={() => setTab('adicionais')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'adicionais' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}`}
        >Adicionais & Bordas</button>
      </div>

      {tab === 'produtos' ? (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:border-[#E50914] focus:outline-none"
              />
            </div>
            <select
              value={catFiltro}
              onChange={(e) => setCatFiltro(e.target.value)}
              className="bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#E50914] focus:outline-none"
            >
              <option value="todas">Todas categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
            {canEdit && !locked && (
              <button
                onClick={() => { setEditing(null); setShowForm(true); }}
                className="flex items-center gap-2 bg-[#E50914] hover:bg-[#f6121d] text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
              >
                <Plus size={18} /> Novo
              </button>
            )}
          </div>

          {/* Product table grouped by category */}
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-neutral-900/50 border-b border-essenza-dark-border">
                  <h3 className="text-white font-semibold">{cat}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-neutral-500 text-xs uppercase border-b border-essenza-dark-border">
                        <th className="text-left px-4 py-2">Nome</th>
                        <th className="text-center px-2 py-2">Foto</th>
                        <th className="text-right px-2 py-2">Custo</th>
                        <th className="text-right px-2 py-2">Venda</th>
                        <th className="text-right px-2 py-2">Lucro R$</th>
                        <th className="text-right px-2 py-2">Margem %</th>
                        {canEdit && !locked && <th className="px-4 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => {
                        const lucro = lucroProduto(p.custo, p.preco);
                        const margem = margemProduto(p.custo, p.preco);
                        return (
                          <tr key={p.id} className="border-b border-essenza-dark-border last:border-0 hover:bg-neutral-900/30">
                            <td className="px-4 py-3 text-white font-medium">
                              <div className="flex items-center gap-3">
                                {p.foto ? (
                                  <img
                                    src={p.foto}
                                    alt={p.nome}
                                    loading="lazy"
                                    className="w-10 h-10 rounded-lg object-cover aspect-square flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
                                    <Flame size={16} className="text-neutral-600" />
                                  </div>
                                )}
                                <span>{p.nome}</span>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-right text-neutral-400">{brl(p.custo)}</td>
                            <td className="px-2 py-3 text-right text-white font-semibold">{brl(p.preco)}</td>
                            <td className="px-2 py-3 text-right text-[#FFD700] font-semibold">{brl(lucro)}</td>
                            <td className="px-2 py-3 text-right">
                              <span className={`font-semibold ${margem >= 70 ? 'text-green-400' : margem >= 50 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                {margem.toFixed(0)}%
                              </span>
                            </td>
                            {canEdit && !locked && (
                              <td className="px-4 py-3">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg">
                                    <Pencil size={16} />
                                  </button>
                                  <button onClick={async () => { if (confirm(`Desativar ${p.nome}?`)) { await supabase.from('produtos').update({ ativo: false }).eq('id', p.id); load(); } }} className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-lg">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <AdicionaisList />
      )}

      {/* Product form modal */}
      {showForm && (
        <ProdutoForm
          produto={editing}
          categorias={categorias}
          onClose={() => setShowForm(false)}
          onSave={async () => { setShowForm(false); await load(); }}
        />
      )}

      {/* Unlock modal */}
      {unlockModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setUnlockModal(false)}>
          <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-4">Desbloquear Tabela v12</h3>
            <input
              type="password"
              value={senhaInput}
              onChange={(e) => setSenhaInput(e.target.value)}
              placeholder="Senha do gerente"
              className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-3 text-white mb-4 focus:border-[#E50914] focus:outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setUnlockModal(false)} className="flex-1 py-2.5 bg-neutral-800 text-neutral-400 rounded-xl">Cancelar</button>
              <button onClick={handleUnlock} className="flex-1 py-2.5 bg-[#E50914] text-white rounded-xl font-semibold">Desbloquear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProdutoForm({ produto, categorias, onClose, onSave }: {
  produto: Produto | null;
  categorias: Categoria[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [nome, setNome] = useState(produto?.nome || '');
  const [categoria, setCategoria] = useState(produto?.categoria_nome || categorias[0]?.nome || '');
  const [custo, setCusto] = useState(String(produto?.custo || ''));
  const [preco, setPreco] = useState(String(produto?.preco || ''));
  const [foto, setFoto] = useState(produto?.foto || '');
  const [uploading, setUploading] = useState(false);
  const [tamanho, setTamanho] = useState(produto?.tamanho || '');
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [destaque, setDestaque] = useState(produto?.destaque ?? false);
  const [saving, setSaving] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `produtos/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('produtos-fotos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('produtos-fotos').getPublicUrl(fileName);
      setFoto(data.publicUrl);
    } catch {
      alert('Erro ao enviar foto. Tente novamente.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const c = parseFloat(custo) || 0;
  const p = parseFloat(preco) || 0;
  const lucro = lucroProduto(c, p);
  const margem = margemProduto(c, p);

  const save = async () => {
    setSaving(true);
    const cat = categorias.find((x) => x.nome === categoria);
    const data = {
      nome,
      categoria_nome: categoria,
      categoria_id: cat?.id || null,
      custo: c,
      preco: p,
      foto: foto || null,
      tamanho,
      ativo,
      destaque,
    };
    if (produto) {
      await supabase.from('produtos').update(data).eq('id', produto.id);
    } else {
      await supabase.from('produtos').insert(data);
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg">{produto ? 'Editar Produto' : 'Novo Produto'}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-neutral-400 text-sm">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white mt-1 focus:border-[#E50914] focus:outline-none" />
          </div>
          <div>
            <label className="text-neutral-400 text-sm">Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white mt-1 focus:border-[#E50914] focus:outline-none">
              {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-neutral-400 text-sm">Custo (R$)</label>
              <input type="number" step="0.01" value={custo} onChange={(e) => setCusto(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white mt-1 focus:border-[#E50914] focus:outline-none" />
            </div>
            <div>
              <label className="text-neutral-400 text-sm">Preço Venda (R$)</label>
              <input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white mt-1 focus:border-[#E50914] focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-neutral-400 text-sm">Foto do Produto</label>

            {/* Upload area */}
            <div className="mt-1 flex items-center gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 bg-neutral-900 border-2 border-dashed border-essenza-dark-border rounded-xl px-4 py-3 text-neutral-400 text-sm cursor-pointer hover:border-[#E50914] hover:text-white transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? (
                  <><Loader2 size={18} className="animate-spin" /> Enviando...</>
                ) : (
                  <><Upload size={18} /> Enviar foto do dispositivo</>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleUpload}
                />
              </label>
              {foto && (
                <button onClick={() => setFoto('')} className="text-red-400 text-sm flex items-center gap-1 px-2">
                  <X size={14} /> Remover
                </button>
              )}
            </div>

            {/* URL input (manual) */}
            <input value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="ou cole uma URL de imagem..." className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white mt-2 focus:border-[#E50914] focus:outline-none text-sm" />

            {/* Preview */}
            {foto ? (
              <div className="mt-2">
                <img
                  src={foto}
                  alt="Pré-visualização"
                  loading="lazy"
                  className="w-20 h-20 rounded-xl object-cover aspect-square border border-essenza-dark-border"
                />
              </div>
            ) : (
              <div className="mt-2 w-20 h-20 rounded-xl bg-neutral-800 border border-essenza-dark-border flex items-center justify-center">
                <ImageIcon size={24} className="text-neutral-600" />
              </div>
            )}
          </div>
          <div>
            <label className="text-neutral-400 text-sm">Tamanho</label>
            <input value={tamanho} onChange={(e) => setTamanho(e.target.value)} placeholder="P, G, Esfirra..." className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white mt-1 focus:border-[#E50914] focus:outline-none" />
          </div>

          {/* Profit preview */}
          <div className="grid grid-cols-3 gap-2 bg-neutral-900 rounded-xl p-3">
            <div className="text-center">
              <p className="text-neutral-500 text-xs">Lucro R$</p>
              <p className="text-[#FFD700] font-bold">{brl(lucro)}</p>
            </div>
            <div className="text-center">
              <p className="text-neutral-500 text-xs">Margem %</p>
              <p className="text-green-400 font-bold">{margem.toFixed(0)}%</p>
            </div>
            <div className="text-center">
              <p className="text-neutral-500 text-xs">Status</p>
              <p className={`font-bold ${ativo ? 'text-green-400' : 'text-red-400'}`}>{ativo ? 'Ativo' : 'Inativo'}</p>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-neutral-300 text-sm">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 accent-[#E50914]" /> Ativo
            </label>
            <label className="flex items-center gap-2 text-neutral-300 text-sm">
              <input type="checkbox" checked={destaque} onChange={(e) => setDestaque(e.target.checked)} className="w-4 h-4 accent-[#E50914]" /> Destaque
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-800 text-neutral-400 rounded-xl font-medium">Cancelar</button>
          <button onClick={save} disabled={saving || !nome} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdicionaisList() {
  const { usuario } = useAuth();
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Adicional | null>(null);
  const canEdit = usuario?.role === 'gerente';

  const load = async () => {
    const { data } = await supabase.from('adicionais').select('*').order('nome');
    setAdicionais((data as Adicional[]) || []);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Adicionais & Bordas</h3>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-[#E50914] text-white px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={18} /> Novo
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {adicionais.map((a) => (
          <div key={a.id} className="bg-essenza-dark-card border border-essenza-dark-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{a.nome}</p>
              <p className="text-[#FFD700] font-semibold">{brl(a.preco)}</p>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <button onClick={() => { setEditing(a); setShowForm(true); }} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg">
                  <Pencil size={16} />
                </button>
                <button onClick={async () => { if (confirm(`Excluir ${a.nome}?`)) { await supabase.from('adicionais').delete().eq('id', a.id); load(); } }} className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {showForm && (
        <AdicionalForm adicional={editing} onClose={() => setShowForm(false)} onSave={async () => { setShowForm(false); await load(); }} />
      )}
    </div>
  );
}

function AdicionalForm({ adicional, onClose, onSave }: { adicional: Adicional | null; onClose: () => void; onSave: () => void }) {
  const [nome, setNome] = useState(adicional?.nome || '');
  const [preco, setPreco] = useState(String(adicional?.preco || ''));

  const save = async () => {
    const data = { nome, preco: parseFloat(preco) || 0, ativo: true };
    if (adicional) {
      await supabase.from('adicionais').update(data).eq('id', adicional.id);
    } else {
      await supabase.from('adicionais').insert(data);
    }
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-white font-bold text-lg mb-4">{adicional ? 'Editar' : 'Novo'} Adicional</h3>
        <div className="space-y-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex: Borda Catupiry)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white focus:border-[#E50914] focus:outline-none" />
          <input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Preço (R$)" className="w-full bg-neutral-900 border border-essenza-dark-border rounded-xl px-4 py-2.5 text-white focus:border-[#E50914] focus:outline-none" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-800 text-neutral-400 rounded-xl">Cancelar</button>
          <button onClick={save} disabled={!nome} className="flex-1 py-3 bg-[#E50914] text-white rounded-xl font-semibold disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}
