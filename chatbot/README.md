# ESSENZA Pizzaria - Chatbot de WhatsApp com IA

Este módulo é um robô autônomo em Node.js projetado para rodar em segundo plano em qualquer computador ou servidor local, conectando um número real de WhatsApp da pizzaria diretamente à Inteligência Artificial do Google Gemini (flash-lite, otimizado para respostas rápidas) e ao seu banco de dados Supabase.

Ele permite que clientes façam perguntas sobre horários de funcionamento, taxas de entrega por bairro, recebam o cardápio oficial em PDF, montem pizzas meio a meio com cálculo automático de valor (cobrando o sabor mais caro, disponível só no tamanho G), interpretem mensagens de áudio, façam pedidos (retirada ou entrega) ou reservem mesa no salão — tudo isso caindo diretamente no painel do estabelecimento em tempo real.

Todas as conversas reais ficam visíveis ao vivo no painel **Monitoramento** do app (aba lateral), onde a equipe pode acompanhar, tomar posse de uma conversa a qualquer momento, dar feedback nas respostas da IA e manter uma base de conhecimento com regras que a IA deve sempre seguir.

---

## Requisitos
- **Node.js**: Versão 18 ou superior instalada na máquina.
- **Conexão de Internet**: Para manter a sincronização com o WhatsApp e o Supabase.

---

## Como Configurar

1. **Configurar as Variáveis de Ambiente (`.env`)**
   Na pasta raiz do projeto ou na pasta `chatbot`, certifique-se de que o arquivo `.env` contenha as seguintes variáveis:
   ```env
   # Credenciais do Supabase (já vêm configuradas por padrão)
   VITE_SUPABASE_URL=https://xlpujpuicszydtfrcodd.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   
   # Chave do Gemini (Obtenha uma gratuitamente em: https://aistudio.google.com/)
   GEMINI_API_KEY=sua_chave_do_gemini_aqui
   
   # Configurações adicionais de tempo de preparo (opcional)
   # BASE_WAIT_TIME: tempo médio real de preparo de um pedido (do forno até pronto)
   # WAIT_TIME_PER_ORDER: minutos somados por cada pedido ativo na cozinha (delivery + balcão/salão juntos)
   BASE_WAIT_TIME=20
   WAIT_TIME_PER_ORDER=5

   # Número (com DDD e código do país, só números) que recebe alertas de "atenção humana"
   # quando a IA sinaliza reclamações ou situações fora do escopo dela.
   # Este MESMO número também recebe os relatórios automáticos (diário/semanal). (opcional)
   OWNER_ALERT_PHONE=5511999998888

   # Dia da semana do relatório SEMANAL (0=domingo ... 6=sábado). Padrão 1 (segunda,
   # folga comum de pizzaria). O relatório diário sempre sai às 09:00. (opcional)
   RELATORIO_SEMANAL_DIA=1
   ```

2. **Instalar Dependências**
   Abra o seu terminal na pasta `chatbot` e execute:
   ```bash
   npm install
   ```
   *(Ou na pasta raiz do projeto executando `npm run chatbot` que fará isso automaticamente).*

---

## Como Iniciar

1. **Rode o Bot**
   A partir da pasta raiz do projeto, execute:
   ```bash
   npm run chatbot
   ```
   *(Ou na pasta `chatbot` execute `npm start`).*

2. **Escaneie o QR Code**
   - Na primeira execução, o bot gerará um **QR Code em formato de texto** diretamente no terminal.
   - Abra o WhatsApp no celular do estabelecimento, clique nos três pontinhos ou configurações, selecione **Aparelhos Conectados** -> **Conectar um aparelho**.
   - Escaneie o QR Code exibido na tela do terminal.

3. **Status de Pronto**
   Depois de conectado, o terminal exibirá a mensagem:
   `🚀 WhatsApp conectado com sucesso! O bot de IA está pronto para atender.`
   
   A sessão ficará salva localmente na pasta `auth_info_baileys`, ou seja, você não precisará escanear o QR Code nas próximas vezes que iniciar o bot.

---

## Como a IA toma decisões de pedidos?

O bot utiliza o modelo **Gemini 1.5 Flash** em modo estruturado JSON. A cada mensagem do cliente, ele:
1. Consulta a lista de produtos ativos (cardápio) no Supabase.
2. Consulta a lista de bairros e taxas de entrega no Supabase.
3. Consulta o número de pedidos ativos na cozinha para estimar dinamicamente o tempo de entrega.
4. Quando o cliente informa Nome, Endereço, Bairro, Itens e Forma de Pagamento e confirma expressamente o pedido, o robô faz uma chamada ao Supabase para:
   - Cadastrar o cliente em `clientes` (se for novo).
   - Gerar um número sequencial único para o pedido.
   - Cadastrar o pedido na tabela `pedidos` com status `recebido`.
   - Cadastrar os itens e adicionais na tabela `itens_pedido`.
   - Registrar a entrada financeira no fluxo de `caixa`.
5. Envia o resumo formatado com o número do pedido e tempo de espera calculado no WhatsApp do cliente.

---

## Monitoramento e Tomada de Posse

Toda conversa real do WhatsApp é salva no Supabase (`ia_conversas` / `ia_mensagens`) e aparece ao vivo na aba **Monitoramento** do painel administrativo:

- **Conversas que precisam de atenção** ficam destacadas no topo da lista — a própria IA marca isso quando detecta reclamação, pedido de falar com humano, ou algo fora do que ela sabe responder com segurança. Se `OWNER_ALERT_PHONE` estiver configurado, o bot também manda uma mensagem de WhatsApp avisando o dono/gerente na hora.
- **"Tomar Posse"** transfere a conversa para um atendente humano — o bot para de responder automaticamente àquele cliente, e a equipe pode digitar respostas direto no painel, que o bot entrega pelo WhatsApp real em poucos segundos.
- **"Devolver para IA"** retorna o controle da conversa para o robô.
- **👍/👎** em cada resposta da IA ficam salvos como feedback — não treinam o modelo automaticamente (isso exigiria fine-tuning), mas dão um histórico do que funcionou ou não para revisar o prompt depois.
- Aba **Base de Conhecimento**: qualquer regra ou resposta que a equipe cadastrar ali é injetada automaticamente no contexto da IA em toda conversa (simulador e WhatsApp real), sem precisar mexer no código.

---

## Relatórios Automáticos no WhatsApp

Com o bot conectado e `OWNER_ALERT_PHONE` configurado, o robô envia relatórios de vendas automaticamente pelo mesmo número já conectado (via `node-cron`):

- **Diário — todo dia às 09:00**: resume o dia anterior (faturamento, lucro, margem, nº de pedidos, ticket médio, sabor mais vendido e uma sugestão).
- **Semanal — no dia de folga às 09:00**: resume os últimos 7 dias, com o melhor dia da semana. O dia é configurável por `RELATORIO_SEMANAL_DIA` (padrão segunda-feira).

Os números vêm direto do banco (custo e lucro que o app grava em cada pedido). Como dependem do `node-cron` e da conexão do WhatsApp, **os relatórios só rodam com o robô ligado** (`npm run chatbot`) — não rodam no Vercel. Arquivos: `services/whatsappService.js` (geração/envio) e `cron/relatorios.js` (agendamento).
