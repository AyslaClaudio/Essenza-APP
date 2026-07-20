# Adendo de Arquitetura — Essenza App

Este documento complementa `arquitetura-erp-pizzaria.md` (entregue antes) com: nomes de tabela exatos solicitados, o Módulo 3 (impressão térmica) e a função de trava de segurança adaptada ao padrão de ícones (engrenagem/cifrão) da linha do produto.

## 1. Tabelas com os nomes solicitados

O núcleo pedido — `configuracoes_sistema`, `produtos`, `pedidos`, `itens_pedido`, `motoboys` — segue o mesmo princípio do documento anterior (nunca sobrescrever preço/custo, sempre nova linha com vigência). Renomeando/mapeando:

```sql
-- Antes: configuracoes_negocio  →  agora: configuracoes_sistema (mesmo formato chave-valor tipado)
CREATE TABLE configuracoes_sistema (
    chave           VARCHAR(80) PRIMARY KEY,
    valor           TEXT NOT NULL,
    tipo            VARCHAR(20) NOT NULL, -- 'boolean' | 'numeric' | 'enum' | 'json'
    atualizado_em   TIMESTAMP DEFAULT NOW()
);
-- Linhas relevantes ao novo módulo:
-- ('imprimir_automatico_ao_finalizar', 'true', 'boolean')
-- ('impressora_padrao_largura', '80mm', 'enum')  -- '58mm' | '80mm'
-- ('regra_pizza_meio_a_meio', 'sabor_mais_caro', 'enum')

-- Antes: itens_pedido já existia como pedido_itens — mantendo o nome pedido pelo usuário:
ALTER TABLE pedido_itens RENAME TO itens_pedido;
```

`produtos`, `pedidos` e `motoboys` seguem exatamente o schema já definido no documento anterior (histórico de preços em `produto_precos_historico`, snapshot de preço/custo em `itens_pedido`, vigência em `taxas_pagamento`).

## 2. Módulo 3 — Impressão térmica (ESC/POS)

```sql
CREATE TABLE impressoras (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(60) NOT NULL,          -- ex: "Balcão", "Cozinha"
    conexao         VARCHAR(10) NOT NULL CHECK (conexao IN ('usb','bluetooth')),
    largura_papel   VARCHAR(5) NOT NULL CHECK (largura_papel IN ('58mm','80mm')),
    identificador   VARCHAR(120),                  -- endereço MAC (bluetooth) ou device id (usb)
    ativa           BOOLEAN DEFAULT TRUE
);

CREATE TABLE impressoes_log (
    id          SERIAL PRIMARY KEY,
    pedido_id   INTEGER NOT NULL REFERENCES pedidos(id),
    impressora_id INTEGER REFERENCES impressoras(id),
    tipo        VARCHAR(20), -- 'manual' | 'automatica'
    impresso_em TIMESTAMP DEFAULT NOW()
);
```

**Ponto técnico importante para você decidir com antecedência:** existem dois níveis de "compatível com impressora térmica" num PWA, e vale saber a diferença antes de escolher o caminho:

1. **Impressão via `window.print()` num layout formatado para 58mm/80mm** (o que o protótipo abaixo implementa). Funciona bem quando a impressora térmica está instalada no sistema operacional como impressora padrão (USB com driver, ou Bluetooth pareada como impressora do SO). É o caminho mais simples, roda 100% no navegador, sem custo.
2. **Envio de comandos ESC/POS brutos via WebUSB ou WebBluetooth**, sem depender de driver/impressora instalada no SO — dá controle fino (corte automático de papel, negrito nativo do hardware, abertura de gaveta). É mais robusto para operação de PDV real, mas exige protocolo específico por marca de impressora e permissões de hardware do navegador (funciona em Chrome/Edge desktop e Android; não funciona em iOS Safari). Posso implementar isso como uma segunda camada depois que você validar o caminho 1 — é trabalho adicional, não inclusivo neste protótipo.

O protótipo entregue usa o caminho 1, que já resolve a grande maioria dos casos reais de pizzaria pequena.

## 3. Trava de segurança — padrão de ícones (engrenagem / cifrão) por linha

Adaptando a lógica anterior ao novo padrão de interação: clique na engrenagem abre input de custo; clique no cifrão expande o slider de venda; o botão de check (✓) só fica clicável se a margem for positiva.

```javascript
function calcularEstadoLinha(produto, custoEditado, precoEditado) {
  const custo = custoEditado ?? produto.precoCusto;
  const preco = precoEditado ?? produto.precoVenda;

  const margemReais = preco - custo;
  const margemPercentual = preco > 0 ? (margemReais / preco) * 100 : -100;
  const bloqueado = preco <= custo; // <= inclui empate (venda no zero a zero também bloqueia)

  return {
    margemReais,
    margemPercentual,
    bloqueado,
    corLinha: bloqueado ? 'vermelho-pulsante' : 'normal',
    botaoCheckHabilitado: !bloqueado,
    mensagem: bloqueado
      ? 'Operação Bloqueada: Margem com Prejuízo'
      : `Margem Atual: R$ ${margemReais.toFixed(2)} (${margemPercentual.toFixed(1)}%)`
  };
}

// Chamado a cada tecla digitada no input de custo OU a cada movimento do slider de venda
function aoEditarLinha(produtoId, campo, valor) {
  const estadoAtual = estadoEdicaoPorProduto[produtoId] ?? {};
  estadoAtual[campo] = Number(valor);
  estadoEdicaoPorProduto[produtoId] = estadoAtual;

  const produto = produtos.find(p => p.id === produtoId);
  const resultado = calcularEstadoLinha(
    produto,
    estadoAtual.precoCusto,
    estadoAtual.precoVenda
  );

  renderizarLinha(produtoId, resultado); // aplica classe CSS de pulsação vermelha e desabilita o check
}

// Confirmação (botão check) — repete a validação no servidor, nunca confia só no clique local
async function confirmarLinha(produtoId) {
  const estadoAtual = estadoEdicaoPorProduto[produtoId];
  const resposta = await fetch(`/api/produtos/${produtoId}/preco`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(estadoAtual)
  });

  if (resposta.status === 422) {
    // backend recalculou e confirmou que está em prejuízo — trava mantida mesmo que o front tenha falhado
    exibirErroLinha(produtoId, 'Operação Bloqueada: Margem com Prejuízo');
    return;
  }

  limparEstadoEdicao(produtoId);
}
```

A regra de negócio (`preco <= custo` bloqueia) é a mesma dos dois lugares — front para feedback instantâneo, back para garantia real — pelo mesmo motivo explicado no documento anterior: a blindagem contra prejuízo só vale se não depender de o frontend estar certo.
