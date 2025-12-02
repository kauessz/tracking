# 🔒 Política de Segurança

## Versões Suportadas

Apenas a versão mais recente recebe atualizações de segurança ativamente.

| Versão | Suporte          |
| ------ | ---------------- |
| 1.0.x  | ✅ Sim           |
| < 1.0  | ❌ Não           |

## 🛡️ Relatando Vulnerabilidades

A segurança da aplicação é uma prioridade. Se você descobrir uma vulnerabilidade de segurança, por favor:

### Como Reportar

**NÃO** abra uma issue pública no GitHub para vulnerabilidades de segurança.

Em vez disso:

1. **📧 Envie um email para**: ssz.kaue@gmail.com
2. **Assunto**: `[SECURITY] Descrição breve da vulnerabilidade`
3. **Incluir**:
   - Tipo de vulnerabilidade
   - Passos para reproduzir
   - Impacto potencial
   - Sugestões de correção (se houver)

### O que Esperar

- **Confirmação**: Resposta inicial em até 48 horas
- **Atualização**: Status da investigação em até 7 dias
- **Correção**: Patch de segurança o mais rápido possível
- **Crédito**: Reconhecimento público (se desejar)

### Informações a Incluir

Para nos ajudar a entender melhor a vulnerabilidade, inclua:

```markdown
## Resumo
Descrição breve da vulnerabilidade

## Tipo de Vulnerabilidade
- [ ] SQL Injection
- [ ] XSS (Cross-Site Scripting)
- [ ] CSRF (Cross-Site Request Forgery)
- [ ] Autenticação/Autorização
- [ ] Exposição de Dados Sensíveis
- [ ] Outro: ___________

## Severidade Estimada
- [ ] Crítica
- [ ] Alta
- [ ] Média
- [ ] Baixa

## Passos para Reproduzir
1. Passo 1
2. Passo 2
3. ...

## Impacto
Descrição do impacto potencial

## Ambiente
- Versão da aplicação:
- Node.js version:
- Sistema Operacional:
- Navegador (se aplicável):

## Sugestões de Correção
(Opcional) Como você corrigiria isso?

## Informações Adicionais
Qualquer contexto adicional relevante
```

## 🔐 Melhores Práticas de Segurança

### Para Desenvolvedores

#### 1. Credenciais e Segredos

```javascript
// ❌ NUNCA faça isso
const apiKey = "sk_live_51234567890";

// ✅ Sempre use variáveis de ambiente
const apiKey = process.env.API_KEY;
```

**Checklist:**
- [ ] Nunca commite arquivos `.env`
- [ ] Use `.env.example` para templates
- [ ] Rotacione credenciais periodicamente
- [ ] Use diferentes credenciais para dev/prod
- [ ] Implemente gestão de segredos (Vault, AWS Secrets Manager)

#### 2. Validação de Entrada

```javascript
// ✅ Sempre valide e sanitize inputs
const { body, validationResult } = require('express-validator');

app.post('/tracking',
  body('bl').trim().escape().notEmpty(),
  body('cliente').trim().escape().notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Processar request...
  }
);
```

#### 3. Autenticação e Autorização

```javascript
// ✅ Sempre verifique permissões
const checkPermission = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    
    if (req.user.role !== requiredRole) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    
    next();
  };
};

app.delete('/tracking/:id', 
  authenticateToken,
  checkPermission('admin'),
  deleteTracking
);
```

#### 4. Proteção contra SQL Injection

```javascript
// ❌ NUNCA concatene strings SQL
const query = `SELECT * FROM cargas WHERE id = '${req.params.id}'`;

// ✅ Use prepared statements / parametrized queries
const { data, error } = await supabase
  .from('cargas')
  .select()
  .eq('id', req.params.id);
```

#### 5. HTTPS Obrigatório

```javascript
// ✅ Force HTTPS em produção
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}
```

#### 6. Rate Limiting

```javascript
// ✅ Implemente rate limiting
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de requests
  message: 'Muitas requisições, tente novamente mais tarde'
});

app.use('/api/', limiter);
```

#### 7. Headers de Segurança

```javascript
// ✅ Use Helmet para headers seguros
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
```

### Para Usuários/Administradores

#### 1. Senhas Fortes

- ✅ Mínimo 12 caracteres
- ✅ Combine letras, números e símbolos
- ✅ Não reutilize senhas
- ✅ Use gerenciador de senhas
- ✅ Habilite 2FA quando disponível

#### 2. Acesso Seguro

- ✅ Sempre use HTTPS
- ✅ Não compartilhe credenciais
- ✅ Faça logout após uso
- ✅ Use redes seguras (evite WiFi público)
- ✅ Mantenha navegador atualizado

#### 3. Dados Sensíveis

- ✅ Não inclua dados sensíveis em URLs
- ✅ Revise permissões de usuários regularmente
- ✅ Faça backup de dados importantes
- ✅ Use criptografia para arquivos sensíveis

## 🚨 Resposta a Incidentes

Em caso de incidente de segurança:

### 1. Detecção
- Monitor de logs de erro
- Alertas automáticos
- Relatórios de usuários

### 2. Contenção
- Isolar sistema afetado
- Bloquear acessos suspeitos
- Preservar evidências

### 3. Erradicação
- Identificar causa raiz
- Remover vulnerabilidade
- Aplicar patches

### 4. Recuperação
- Restaurar sistemas
- Verificar integridade
- Monitorar atividade

### 5. Lições Aprendidas
- Documentar incidente
- Atualizar procedimentos
- Treinar equipe

## 📊 Auditorias de Segurança

### Checklist Mensal

- [ ] Revisar logs de acesso
- [ ] Verificar dependências desatualizadas (`npm audit`)
- [ ] Revisar permissões de usuários
- [ ] Testar backups
- [ ] Verificar certificados SSL
- [ ] Revisar regras de firewall

### Ferramentas Recomendadas

```bash
# Verificar vulnerabilidades em dependências
npm audit
npm audit fix

# Análise de código estático
npm run lint

# Verificar segurança do código
npx eslint-plugin-security
```

## 🔗 Recursos Adicionais

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [NPM Security](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities)

## 📜 Política de Divulgação

- Vulnerabilidades corrigidas serão divulgadas após patch
- Crédito será dado ao descobridor (se permitido)
- Detalhes técnicos serão publicados após período de atualização

## 🏆 Hall da Fama de Segurança

Agradecemos aos pesquisadores que reportaram vulnerabilidades:

| Data | Pesquisador | Vulnerabilidade | Severidade |
|------|-------------|-----------------|------------|
| - | - | - | - |

_Seja o primeiro a contribuir!_

---

## 📞 Contato

**Email de Segurança**: ssz.kaue@gmail.com  
**PGP Key**: [Disponível em breve]

**Resposta Esperada**: 48 horas  
**Disponibilidade**: Segunda a Sexta, 9h-18h (BRT)

---

**Última Atualização**: Dezembro 2024  
**Próxima Revisão**: Março 2025

Obrigado por ajudar a manter este projeto seguro! 🙏
