import { z } from 'zod';

export const configLojaSchema = z.object({
  nome_loja: z.string().min(1, 'Nome da loja é obrigatório'),
  telefone_loja: z.string().optional().default(''),
  endereco_loja: z.string().optional().default(''),
  logo: z.string().nullable().optional(),
  horario_abertura: z.string().optional().default(''),
  horario_fechamento: z.string().optional().default(''),
  taxa_fixa_entrega: z.number().min(0, 'Taxa deve ser >= 0').default(0),
  despesas_fixas_diaria: z.number().min(0, 'Despesas devem ser >= 0').default(0),
  meta_diaria: z.number().min(1, 'Meta diária deve ser > 0').default(2000),
  cor_primaria: z.string().optional().default('#E50914'),
  cor_fundo: z.string().optional().default('#0A0A0A'),
  cor_lucro: z.string().optional().default('#FFD700'),
});

export type ConfigLojaInput = z.infer<typeof configLojaSchema>;

export const metaSchema = z.object({
  valor: z.number().min(1, 'Meta deve ser > 0'),
  periodo: z.enum(['dia', 'semana', 'mes']).default('dia'),
});

export type MetaInput = z.infer<typeof metaSchema>;
