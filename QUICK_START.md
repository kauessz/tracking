# ⚡ Guia Rápido de Início

Começar com o **Logistics Tracking System** em menos de 10 minutos!

## 🎯 Pré-requisitos

Antes de começar, certifique-se de ter:

- ✅ [Node.js](https://nodejs.org/) (v16+)
- ✅ [Git](https://git-scm.com/)
- ✅ Conta [Supabase](https://supabase.com) (gratuita)
- ✅ Projeto [Firebase](https://firebase.google.com) (gratuito)
- ✅ Editor de código ([VS Code](https://code.visualstudio.com/) recomendado)

## 🚀 Instalação Rápida

### 1️⃣ Clone o Projeto

```bash
git clone https://github.com/kauessz/tracking.git
cd tracking
```

### 2️⃣ Instale Dependências

```bash
npm install
```

### 3️⃣ Configure Variáveis de Ambiente

```bash
# Copie o template
cp .env.example .env

# Edite com suas credenciais
nano .env  # ou use seu editor preferido
```

**Mínimo necessário no `.env`:**
```env
PORT=3000
SUPABASE_URL=sua_url_aqui
SUPABASE_KEY=sua_chave_aqui
FIREBASE_API_KEY=sua_chave_aqui
FIREBASE_AUTH_DOMAIN=seu_dominio.firebaseapp.com
FIREBASE_PROJECT_ID=seu_project_id
```

### 4️⃣ Configure o Banco de Dados

```bash
# 1. Acesse seu projeto no Supabase
# 2. Vá em SQL Editor
# 3. Execute o conteúdo de database/schema.sql
```

### 5️⃣ Inicie o Servidor

```bash
npm run dev
```

🎉 **Pronto!** Acesse: http://localhost:3000

---

## 📦 Estrutura Rápida

```
tracking/
├── backend/          # Servidor Node.js/Express
│   ├── server.js     # Arquivo principal
│   ├── routes/       # Rotas da API
│   └── middleware/   # Middlewares
├── frontend/         # Interface web
│   ├── index.html    # Dashboard
│   ├── js/          # Scripts
│   └── css/         # Estilos
└── database/        # Schemas e migrations
```

---

## 🔑 Primeiros Passos

### 1. Criar Primeiro Usuário Admin

```javascript
// Via Firebase Console:
// 1. Vá em Authentication
// 2. Adicione usuário
// 3. No Firestore/Custom Claims, adicione:
{
  "role": "admin"
}
```

### 2. Testar a API

```bash
# Listar cargas
curl http://localhost:3000/api/tracking

# Criar nova carga
curl -X POST http://localhost:3000/api/tracking \
  -H "Content-Type: application/json" \
  -d '{
    "bl": "BL123456",
    "cliente": "ACME Corp",
    "origem": "Santos/SP",
    "destino": "Manaus/AM",
    "eta": "2024-12-15"
  }'
```

### 3. Acessar o Dashboard

1. Abra: http://localhost:3000
2. Faça login com seu usuário Firebase
3. Explore as funcionalidades!

---

## 📚 Recursos Essenciais

### Endpoints Principais

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/tracking` | Lista todas as cargas |
| GET | `/api/tracking/:id` | Detalhes de uma carga |
| POST | `/api/tracking` | Cria nova carga |
| PUT | `/api/tracking/:id` | Atualiza carga |
| DELETE | `/api/tracking/:id` | Remove carga |
| GET | `/api/analytics/kpis` | Indicadores de performance |
| POST | `/api/upload/excel` | Upload de planilha |

### Comandos Úteis

```bash
npm run dev          # Servidor em desenvolvimento
npm start            # Servidor em produção
npm test             # Executar testes
npm run lint         # Verificar código
npm run lint:fix     # Corrigir problemas
```

---

## 🎨 Personalizando

### Mudar Porta do Servidor

```env
# No arquivo .env
PORT=8080
```

### Adicionar Novo Endpoint

```javascript
// backend/routes/custom.js
const express = require('express');
const router = express.Router();

router.get('/minha-rota', (req, res) => {
  res.json({ message: 'Olá!' });
});

module.exports = router;
```

```javascript
// backend/server.js
const customRoutes = require('./routes/custom');
app.use('/api/custom', customRoutes);
```

---

## 🐛 Problemas Comuns

### Erro: "Cannot connect to Supabase"

```bash
# Verifique:
1. Credenciais no .env estão corretas
2. Projeto Supabase está ativo
3. IP está na whitelist (se aplicável)

# Teste a conexão:
curl https://SEU_PROJETO.supabase.co/rest/v1/
```

### Erro: "Firebase auth failed"

```bash
# Verifique:
1. Firebase API Key está correto
2. Auth domain está configurado
3. Usuário existe no Firebase
```

### Erro: "Port already in use"

```bash
# Encontre processo na porta:
lsof -i :3000

# Mate o processo:
kill -9 PID

# Ou mude a porta no .env:
PORT=3001
```

---

## 🎓 Próximos Passos

Agora que está tudo funcionando:

1. 📖 Leia a [Documentação Completa](README.md)
2. 🤝 Veja o [Guia de Contribuição](CONTRIBUTING.md)
3. 🔐 Revise a [Política de Segurança](SECURITY.md)
4. 📝 Explore o [Changelog](CHANGELOG.md)

### Tutoriais Recomendados

- [ ] Como adicionar uma nova funcionalidade
- [ ] Como criar testes
- [ ] Como fazer deploy em produção
- [ ] Como configurar CI/CD

### Explore os Módulos

- **Dashboard**: Interface principal de controle
- **Analytics**: Análises e relatórios com gráficos
- **Railway**: Módulo específico para operações ferroviárias
- **Upload**: Sistema de importação de dados

---

## 💡 Dicas Pro

### VS Code Extensions Recomendadas

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "christian-kohler.path-intellisense",
    "formulahendry.auto-rename-tag",
    "bradlc.vscode-tailwindcss"
  ]
}
```

### Git Hooks

```bash
# Instale Husky para git hooks automáticos
npm install -D husky
npx husky install

# Adicione pre-commit hook
npx husky add .husky/pre-commit "npm run lint"
```

### Debug no VS Code

Crie `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "program": "${workspaceFolder}/server.js",
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

---

## 📞 Precisa de Ajuda?

- 📧 Email: ssz.kaue@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/kauessz/tracking/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/kauessz/tracking/discussions)
- 📖 Wiki: [Documentação](https://github.com/kauessz/tracking/wiki)

---

## ⭐ Gostou?

Se este projeto foi útil, considere dar uma estrela no GitHub!

[![Star](https://img.shields.io/github/stars/kauessz/tracking?style=social)](https://github.com/kauessz/tracking)

---

**Tempo estimado de setup**: ⏱️ 5-10 minutos  
**Dificuldade**: 🟢 Fácil

Boa sorte e bom desenvolvimento! 🚀
