# 🤝 Guia de Contribuição

Obrigado por considerar contribuir com o **Logistics Tracking System**! 

Este documento fornece diretrizes para contribuir com o projeto.

## 📋 Índice

- [Código de Conduta](#código-de-conduta)
- [Como Posso Contribuir?](#como-posso-contribuir)
- [Processo de Desenvolvimento](#processo-de-desenvolvimento)
- [Padrões de Código](#padrões-de-código)
- [Commits](#commits)
- [Pull Requests](#pull-requests)
- [Reportando Bugs](#reportando-bugs)
- [Sugerindo Melhorias](#sugerindo-melhorias)

## 📜 Código de Conduta

Este projeto segue um Código de Conduta. Ao participar, você concorda em manter um ambiente respeitoso e colaborativo.

### Nossos Padrões

**Comportamentos Esperados:**
- ✅ Ser respeitoso com diferentes pontos de vista
- ✅ Aceitar críticas construtivas
- ✅ Focar no que é melhor para a comunidade
- ✅ Mostrar empatia com outros membros

**Comportamentos Inaceitáveis:**
- ❌ Uso de linguagem ou imagens sexualizadas
- ❌ Trolling, insultos ou comentários depreciativos
- ❌ Assédio público ou privado
- ❌ Publicar informações privadas de terceiros

## 🚀 Como Posso Contribuir?

Existem várias formas de contribuir:

### 1. Reportando Bugs

Encontrou um bug? Ajude-nos a melhorar!

**Antes de reportar:**
- Verifique se o bug já não foi reportado nas [Issues](https://github.com/kauessz/tracking/issues)
- Certifique-se de estar usando a versão mais recente

**Como reportar:**
1. Use o template de issue para bugs
2. Forneça uma descrição clara e concisa
3. Inclua passos para reproduzir o problema
4. Adicione screenshots se possível
5. Especifique seu ambiente (OS, navegador, versão do Node)

### 2. Sugerindo Melhorias

Tem uma ideia para melhorar o projeto?

1. Abra uma issue com o template de feature request
2. Explique claramente o problema que sua sugestão resolve
3. Descreva a solução proposta
4. Adicione exemplos de uso se possível

### 3. Contribuindo com Código

Quer implementar uma feature ou corrigir um bug?

1. Fork o repositório
2. Crie uma branch para sua feature
3. Faça suas alterações
4. Escreva ou atualize testes
5. Abra um Pull Request

### 4. Melhorando a Documentação

Documentação nunca é demais!

- Corrigir erros de digitação
- Melhorar exemplos
- Adicionar tutoriais
- Traduzir documentação

## 🔧 Processo de Desenvolvimento

### Setup do Ambiente

```bash
# 1. Fork e clone o repositório
git clone https://github.com/seu-usuario/tracking.git
cd tracking

# 2. Instale as dependências
npm install

# 3. Configure o ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

### Estrutura de Branches

- `main` - Branch principal (produção)
- `develop` - Branch de desenvolvimento
- `feature/*` - Novas funcionalidades
- `fix/*` - Correções de bugs
- `docs/*` - Atualizações de documentação
- `refactor/*` - Refatorações de código

### Workflow

```bash
# 1. Crie uma branch a partir de develop
git checkout develop
git pull origin develop
git checkout -b feature/minha-feature

# 2. Faça suas alterações
# ... código ...

# 3. Commit suas mudanças
git add .
git commit -m "feat: adiciona minha feature incrível"

# 4. Push para seu fork
git push origin feature/minha-feature

# 5. Abra um Pull Request
```

## 💻 Padrões de Código

### JavaScript/Node.js

```javascript
// ✅ BOM
const calculateDelay = (eta, ata) => {
  if (!eta || !ata) {
    throw new Error('ETA e ATA são obrigatórios');
  }
  
  const delay = ata - eta;
  return delay > 0 ? delay : 0;
};

// ❌ EVITAR
function calc(a,b){
return b-a
}
```

### Regras Gerais

- **Indentação**: 2 espaços
- **Aspas**: Single quotes para strings
- **Ponto e vírgula**: Sempre usar
- **Nomenclatura**: 
  - `camelCase` para variáveis e funções
  - `PascalCase` para classes
  - `UPPER_CASE` para constantes
- **Comentários**: Em português para lógica de negócio

### ESLint

O projeto usa ESLint. Execute antes de commitar:

```bash
npm run lint
npm run lint:fix  # Corrige automaticamente
```

## 📝 Commits

Seguimos o padrão [Conventional Commits](https://www.conventionalcommits.org/).

### Formato

```
<tipo>(<escopo>): <descrição curta>

<corpo (opcional)>

<rodapé (opcional)>
```

### Tipos

- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Documentação
- `style`: Formatação (não afeta o código)
- `refactor`: Refatoração
- `test`: Testes
- `chore`: Tarefas de manutenção
- `perf`: Melhorias de performance

### Exemplos

```bash
# Feature
git commit -m "feat(tracking): adiciona filtro por cliente"

# Bug fix
git commit -m "fix(upload): corrige erro ao processar xlsx"

# Documentação
git commit -m "docs: atualiza guia de instalação"

# Breaking change
git commit -m "feat(api)!: altera formato de resposta da API

BREAKING CHANGE: O campo 'data' agora é um array"
```

## 🔄 Pull Requests

### Checklist do PR

Antes de abrir um PR, verifique:

- [ ] Código segue os padrões do projeto
- [ ] Testes passando (`npm test`)
- [ ] Lint sem erros (`npm run lint`)
- [ ] Documentação atualizada
- [ ] Commits seguem o padrão
- [ ] Branch atualizada com develop
- [ ] Descrição clara do que foi feito

### Template do PR

```markdown
## Descrição
Breve descrição das mudanças

## Tipo de Mudança
- [ ] Bug fix
- [ ] Nova feature
- [ ] Breaking change
- [ ] Documentação

## Como Testar
1. Passo 1
2. Passo 2

## Screenshots (se aplicável)
...

## Checklist
- [ ] Código revisado
- [ ] Testes adicionados/atualizados
- [ ] Documentação atualizada
```

### Processo de Review

1. **Automatizado**: 
   - CI/CD executa testes
   - Linter verifica código
   - Build é gerado

2. **Manual**:
   - Maintainer revisa o código
   - Pode solicitar mudanças
   - Aprova ou solicita revisão

3. **Merge**:
   - Após aprovação, o PR é merged
   - Branch pode ser deletada

## 🐛 Reportando Bugs

### Template de Bug Report

```markdown
**Descrição do Bug**
Descrição clara e concisa do bug.

**Como Reproduzir**
1. Vá para '...'
2. Clique em '...'
3. Role até '...'
4. Veja o erro

**Comportamento Esperado**
O que deveria acontecer.

**Screenshots**
Se aplicável, adicione screenshots.

**Ambiente**
- OS: [ex: Windows 10]
- Navegador: [ex: Chrome 120]
- Node Version: [ex: 18.17.0]
- Versão: [ex: 1.0.0]

**Contexto Adicional**
Qualquer outra informação relevante.
```

## 💡 Sugerindo Melhorias

### Template de Feature Request

```markdown
**Sua feature está relacionada a um problema?**
Descrição clara do problema.

**Descreva a solução que você gostaria**
Descrição clara e concisa da solução.

**Descreva alternativas consideradas**
Outras abordagens que você pensou.

**Contexto Adicional**
Screenshots, mockups, etc.
```

## 🧪 Testes

### Escrevendo Testes

```javascript
// tests/tracking.test.js
describe('Tracking Module', () => {
  test('deve calcular atraso corretamente', () => {
    const result = calculateDelay('2024-12-01', '2024-12-02');
    expect(result).toBe(1);
  });
  
  test('deve retornar 0 para entregas no prazo', () => {
    const result = calculateDelay('2024-12-02', '2024-12-01');
    expect(result).toBe(0);
  });
});
```

### Executando Testes

```bash
npm test              # Todos os testes
npm test -- --watch   # Watch mode
npm run test:coverage # Com cobertura
```

## 📚 Recursos

- [Documentação Oficial](https://github.com/kauessz/tracking/wiki)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

## 💬 Dúvidas?

- 📧 Email: ssz.kaue@gmail.com
- 💬 Discussions: [GitHub Discussions](https://github.com/kauessz/tracking/discussions)
- 🐛 Issues: [GitHub Issues](https://github.com/kauessz/tracking/issues)

---

## 🎉 Obrigado!

Sua contribuição é muito importante para nós!

Desenvolvido com ❤️ por Kauê Santos e pela comunidade.
