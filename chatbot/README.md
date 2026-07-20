# ESSENZA Pizzaria - Chatbot de WhatsApp com IA

Este módulo é um robô autônomo em Node.js projetado para rodar em segundo plano em qualquer computador ou servidor local, conectando um número real de WhatsApp da pizzaria diretamente à Inteligência Artificial do Google Gemini (1.5 Flash) e ao seu banco de dados Supabase.

Ele permite que clientes façam perguntas sobre horários de funcionamento, taxas de entrega por bairro, vejam o cardápio ativo, montem pizzas meio a meio com cálculo automático de valor (cobrando o sabor mais caro) e façam pedidos que caem diretamente no painel de pedidos do estabelecimento em tempo real.

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
   BASE_WAIT_TIME=30
   WAIT_TIME_PER_ORDER=5
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
