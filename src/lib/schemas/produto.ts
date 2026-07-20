import { z } from 'zod';

export const produtoSchema = z.object({
  nome: z.string().min(1, 'Nome do produto é obrigatório').max(100),
  categoria_id: z.string().nullable(),
  custo: z.number().min(0, 'Custo não pode ser negativo'),
  preco: z.number().min(0, 'Preço não pode ser negativo').refine(
    (preco) => preco > 0,
    'Preço deve ser maior que zero'
  ),
  tamanho: z.string().optional().default(''),
}).refine(
  (data) => data.preco > data.custo || data.preco === 0,
  {
    message: 'Preço deve ser maior que o custo (ou zero para produtos não-venda)',
    path: ['preco'],
  }
);

export type ProdutoInput = z.infer<typeof produtoSchema>;

export const adicionalSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  preco: z.number().min(0, 'Preço não pode ser negativo'),
});

export type AdicionalInput = z.infer<typeof adicionalSchema>;
