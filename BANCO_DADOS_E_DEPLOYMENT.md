# 💾 Banco de Dados e Deployment - Essenza App

## 📊 Onde os Dados Ficam Salvos?

### Banco de Dados: **SUPABASE** (PostgreSQL)

O seu app usa **Supabase** - um backend-as-a-service baseado em PostgreSQL com autenticação integrada.

**Localização dos dados:**
```
Supabase Cloud
├── Projeto: essenza-app (ou seu nome)
├── Banco de dados: PostgreSQL
└── Tabelas:
    ├── pedidos (Orders)
    ├── itens_pedido (Order Items)
    ├── produtos (Products)
    ├── categorias (Categories)
    ├── usuarios (Users/Staff)
    ├── clientes (Customers)
    ├── configuracoes (Settings)
    ├── impressoras (Printers)
    ├── taxa_entrega (Delivery Fees)
    ├── estoque/ingredientes (Inventory)
    ├── metas (Goals)
    ├── caixa (Cash Register)
    └── outras...
```

**Como acessar os dados:**
1. Site: https://supabase.com
2. Login com suas credenciais
3. Projeto → Database → Tabelas
4. Ou via API em tempo real

**Backups automáticos:**
- Supabase faz backups diários
- Retenção: 7 dias (versão paga: até 365 dias)

---

## 🚀 Como Publicar o App (Múltiplos Dispositivos)

### Opção 1: **PWA Web** (Recomendado - Funciona em Tudo)

**O que é:** Progressive Web App - funciona como site E app nativo

**Vantagens:**
- ✅ Funciona em: Desktop (Mac/Windows/Linux), Mobile (iOS/Android), Tablet
- ✅ Instalação: Clique em "Instalar" no navegador
- ✅ Funciona offline (com cache)
- ✅ Uma única build para todos os dispositivos
- ✅ Atualizações automáticas
- ✅ Não precisa de App Store

**Como publicar:**

**Passo 1: Preparar o Projeto**
```bash
cd project
npm run build
```
Gera pasta `dist/` com arquivos estáticos prontos.

**Passo 2: Escolher Hospedagem**

#### A. **Vercel** (Recomendado - GRATUITO + Fácil)
```bash
npm install -g vercel
vercel
# Segue prompts, seleciona projeto
```
- URL: `https://essenza-app.vercel.app`
- Deploy automático ao fazer git push
- SSL automático
- Muito rápido globalmente

#### B. **Netlify** (Alternativa boa)
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```
- URL: `https://essenza-app.netlify.app`
- Deploy em 1 clique
- Suporta custom domain

#### C. **AWS S3 + CloudFront**
- Hospedagem estática + CDN
- Mais caro (~$5-10/mês)
- Para produção heavy-traffic

#### D. **Google Cloud / Azure Static Web Apps**
- Alternativas profissionais
- Integração com CI/CD

**Passo 3: Configurar Custom Domain (Opcional)**
```
Seu domínio: pizzaria-essenza.com.br
Provider: GoDaddy / Registro.br
Apontar DNS para: Vercel/Netlify/seu servidor
```

**Passo 4: Instalar em Dispositivos**

**Desktop (Windows/Mac/Linux):**
1. Acesse: `https://essenza-app.vercel.app`
2. Navegador mostra: "Instalar" ou "Adicionar à tela inicial"
3. Clica em "Instalar"
4. App fica no menu iniciar (Windows) ou Launchpad (Mac)

**Mobile (iPhone/Android):**
1. Abre no Safari (iOS) ou Chrome (Android)
2. Toca menu (⋮) → "Adicionar à tela inicial"
3. Ícone aparece na tela inicial
4. Abre como app nativo

**Tablet:**
- Mesmo processo que mobile

---

### Opção 2: **App Nativo** (Mais Investimento)

Se quiser app na App Store / Google Play:

#### **React Native / Expo**
```bash
npx create-expo-app essenza
# Converte seu React para iOS + Android
npx eas build --platform all
# Build iOS (.ipa) e Android (.apk)
```

**Vantagens:**
- ✅ Na App Store / Google Play
- ❌ Mais caro (Apple Developer: $99/ano, Google: $25 one-time)
- ❌ Atualização mais lenta (aprovação de lojas)
- ❌ Maior tamanho (download)

**Recomendação:** PWA é melhor para você por enquanto.

---

## 🔐 Variáveis de Ambiente (Importantes!)

Seu app precisa das credenciais do Supabase. Crie arquivo `.env.local`:

```env
# Supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=seu-anon-key

# Opcional: Google Maps (se usar localização)
VITE_GOOGLE_MAPS_API_KEY=sua-chave
```

**⚠️ NUNCA commita `.env` no git!**
- Arquivo `.gitignore` já bloqueia
- Variáveis ficam seguras

**Para Vercel:**
1. Dashboard Vercel → Settings → Environment Variables
2. Adiciona cada variável
3. Vercel injeta automaticamente em deploy

---

## 📱 Step-by-Step: Deploy em Vercel (Mais Simples)

### 1. Preparar Repositório Git
```bash
cd project
git init
git add .
git commit -m "Initial commit: Essenza app"
git remote add origin https://github.com/seu-usuario/essenza-app.git
git push -u origin main
```

### 2. Criar Conta Vercel
- Site: https://vercel.com
- Sign up com GitHub / GitLab / Bitbucket
- Autoriza acesso aos repos

### 3. Importar Projeto
1. Dashboard → "Add New Project"
2. Seleciona `essenza-app` do GitHub
3. Vercel detecta `package.json` (Vite)
4. Configura automaticamente:
   - Build: `npm run build`
   - Output: `dist`
   - Install: `npm install`

### 4. Adicionar Variáveis de Ambiente
1. Project Settings → Environment Variables
2. Adiciona:
   ```
   VITE_SUPABASE_URL = https://...
   VITE_SUPABASE_ANON_KEY = ...
   ```
3. Save → Deploy

### 5. Deploy Automático
```bash
# Sempre que fizer push no GitHub:
git push origin main
# Vercel detecta, rebuilda e publica automaticamente
```

**URL Final:**
- Automática: `https://essenza-app.vercel.app`
- Custom: `https://pizzaria-essenza.com.br` (aponta DNS para Vercel)

---

## 🔄 Fluxo de Atualização

```
Local (sua máquina)
    ↓
    npm run dev (testa local)
    ↓
git add → git commit → git push
    ↓
GitHub (seu repositório)
    ↓
Vercel (detecta push)
    ↓
Vercel rebuilda + publica
    ↓
https://essenza-app.vercel.app (live)
```

**Usuários veem atualização em segundos!**

---

## 💰 Custos Estimados

| Componente | Versão | Custo Mensal |
|-----------|--------|-------------|
| **Vercel** (hosting) | Pro | $20/mês (ou FREE para começar) |
| **Supabase** (banco) | Pro | $25/mês (FREE até 500MB dados) |
| **Domain** (opcional) | .com.br | ~$30-50/ano |
| **Total** | | **~$45-70/mês** (ou $20-25/mês no FREE) |

### Começar Grátis:
- ✅ Vercel: FREE até 100GB/mês
- ✅ Supabase: FREE até 500MB + 2 projetos
- ✅ Domain: Usar `essenza-app.vercel.app`

**Evolua quando tiver volume de clientes.**

---

## 🛠️ Segurança em Produção

### Checklist Importante:
- ✅ Supabase RLS ativado (row-level security)
- ✅ Variáveis de ambiente protegidas
- ✅ HTTPS ativado (Vercel + Supabase ambos forçam)
- ✅ Backups configurados
- ✅ Senha forte no Supabase
- ✅ 2FA no Supabase (optional mas recomendado)

### SSL/TLS:
- Vercel: Automático (Let's Encrypt)
- Supabase: Automático
- Seu app: SEMPRE HTTPS

---

## 📲 Experiência do Usuário

### Desktop (Windows/Mac)
```
1. Digita: https://essenza-app.com.br
2. Vê: "Instalar" botão na barra de endereço
3. Clica → App instalado no menu iniciar
4. Abre como janela desktop nativa
```

### Mobile (iPhone)
```
1. Abre Safari → https://essenza-app.com.br
2. Toca compartilhar → "Adicionar à tela inicial"
3. Ícone na home screen
4. Abre em fullscreen (como app)
```

### Mobile (Android)
```
1. Abre Chrome → https://essenza-app.com.br
2. Toca ⋮ → "Instalar app"
3. App na play button / home screen
4. Abre como app nativo
```

**Tudo funciona offline (com cache local)!**

---

## 🚀 Próximos Passos Recomendados

### Semana 1: Deploy
- [ ] Criar conta Vercel
- [ ] Conectar GitHub
- [ ] Deploy primeira versão
- [ ] Testar em dispositivos

### Semana 2: Melhorias
- [ ] Fase 5: Validação em componentes
- [ ] Fase 7: Segurança
- [ ] Testes com dados reais

### Semana 3: Produção
- [ ] Supabase banco real
- [ ] Domain customizado
- [ ] Monitoramento
- [ ] Backups

---

## ❓ FAQ

**P: Meus dados ficarão seguros?**
R: Sim! Supabase é enterprise-grade, encriptação end-to-end, backups diários.

**P: Quanto custa rodar?**
R: Grátis para começar (<500MB dados). Paga apenas quando crescer.

**P: Posso usar meu próprio servidor?**
R: Sim, mas Vercel é mais fácil. Alternativa: instalar no servidor próprio (Docker).

**P: App funciona offline?**
R: Sim! PWA faz cache. Sincroniza quando online.

**P: Posso ter múltiplas pizzarias?**
R: Sim! Banco de dados único com `store_id` para cada pizzaria.

**P: Como fazer backup dos dados?**
R: Supabase automático. Manual: Supabase → Database → Export.

---

## 📚 Links Úteis

- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
- PWA Info: https://web.dev/progressive-web-apps/
- React Vite Guide: https://vitejs.dev/guide/

---

**Recomendação Final:** Deploy em Vercel esta semana! 🚀

Com 5 minutos você tem o app live em produção, acessível em qualquer dispositivo.
