export type Role = 'atendente' | 'caixa' | 'gerente';

export interface Usuario {
  id: string;
  user_id: string;
  nome: string;
  role: Role;
  ativo: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  categoria_id: string | null;
  categoria_nome: string;
  custo: number;
  preco: number;
  foto: string | null;
  ativo: boolean;
  destaque: boolean;
  tamanho: string;
}

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
  base_custo: number;
}

export interface Adicional {
  id: string;
  nome: string;
  preco: number;
  ativo: boolean;
}

export interface Ingrediente {
  id: string;
  nome: string;
  unidade: string;
  custo_por_unidade: number;
  estoque_atual: number;
  estoque_minimo: number;
}

export interface FichaTecnica {
  id: string;
  produto_id: string;
  ingrediente_id: string;
  quantidade: number;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  cep: string;
  referencia: string;
}

export type PedidoStatus = 'recebido' | 'preparo' | 'forno' | 'saiu' | 'entregue' | 'cancelado';

export interface Pedido {
  id: string;
  numero: number;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_endereco: string;
  cliente_bairro: string;
  tipo: 'balcao' | 'delivery' | 'cliente';
  status: PedidoStatus;
  subtotal: number;
  taxa_entrega: number;
  desconto: number;
  total: number;
  custo_total: number;
  lucro: number;
  forma_pagamento: string;
  observacao: string;
  cupom: string;
  avaliacao: number;
  created_at: string;
  updated_at: string;
  itens?: ItemPedido[];
}

export interface ItemPedido {
  id: string;
  pedido_id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  observacao: string;
  sabor1: string;
  sabor2: string;
  adicional: string;
  adicional_preco: number;
}

export interface Reserva {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  data: string;
  horario: string;
  numero_pessoas: number;
  observacao: string;
  status: 'pendente' | 'confirmada' | 'cancelada';
  created_at: string;
}

export interface IaConversa {
  id: string;
  telefone: string;
  cliente_nome: string;
  canal: 'simulador' | 'whatsapp';
  status: 'ia' | 'humano' | 'resolvida';
  precisa_atencao: boolean;
  motivo_atencao: string;
  last_message_at: string;
  created_at: string;
}

export interface IaMensagem {
  id: string;
  conversa_id: string;
  remetente: 'cliente' | 'ia' | 'humano' | 'sistema';
  texto: string;
  feedback: 'positivo' | 'negativo' | '';
  enviado: boolean;
  created_at: string;
}

export interface IaConhecimento {
  id: string;
  topico: string;
  conteudo: string;
  ativo: boolean;
  created_at: string;
}

export interface CaixaEntry {
  id: string;
  tipo: 'entrada' | 'saida';
  descricao: string;
  valor: number;
  forma_pagamento: string;
  pedido_id: string | null;
  data: string;
}

export interface Configuracao {
  id: string;
  nome_loja: string;
  logo: string | null;
  cor_primaria: string;
  cor_fundo: string;
  cor_lucro: string;
  horario_abertura: string;
  horario_fechamento: string;
  telefone_loja: string;
  endereco_loja: string;
  taxa_fixa_entrega: number;
  despesas_fixas_diaria: number;
  meta_diaria: number;
  fidelidade_ativo: boolean;
  fidelidade_regras: string;
  tabela_bloqueada: boolean;
  senha_tabela: string;
}

export interface Impressora {
  id: string;
  nome: string;
  tipo: 'usb' | 'rede' | 'bluetooth';
  modelo: string;
  funcao: 'cozinha' | 'caixa' | 'entrega';
  ativa: boolean;
  ip: string;
  porta: string;
}

export interface TaxaEntrega {
  id: string;
  bairro: string;
  cep: string;
  taxa: number;
  ativo: boolean;
}

export interface Promocao {
  id: string;
  nome: string;
  itens: string;
  preco: number;
  custo: number;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
}

export interface Meta {
  id: string;
  tipo: string;
  valor: number;
  periodo: string;
  ativo: boolean;
}

export interface Avaliacao {
  id: string;
  pedido_id: string;
  cliente_nome: string;
  nota: number;
  comentario: string;
}
