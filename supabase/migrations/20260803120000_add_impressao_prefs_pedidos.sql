-- Preferência de impressão (cozinha/caixa) por pedido.
--
-- Hoje o Balcão tem checkboxes "Imprimir Cozinha" / "Imprimir Caixa", mas elas
-- só têm efeito no fluxo OFFLINE (fila local). No fluxo online, o pedido é só
-- inserido no banco e quem imprime de fato é o listener central em Adm.tsx
-- (Realtime, table pedidos), que sempre imprime cozinha + caixa juntas, sem
-- saber da escolha da usuária feita no aparelho que criou o pedido — inclusive
-- quando é um aparelho diferente do que tem a impressora conectada.
--
-- Guardar a preferência na própria linha do pedido resolve isso pros dois
-- casos: mesmo aparelho e aparelho diferente (celular lança, PC imprime).
alter table public.pedidos
  add column if not exists imprimir_cozinha boolean not null default true,
  add column if not exists imprimir_caixa boolean not null default true;
