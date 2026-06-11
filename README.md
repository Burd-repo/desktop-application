<div align="left">

  <a href="https://burd.ia">
    <img src="./public/burd-logo.svg" alt="Logo da Burd" title="Burd Desktop Application" align="left" height="40" />
  </a>

**Burd Desktop Application** é o console local da Burd para validar máquinas, gerenciar o Burd Agent e preparar um computador para atuar como provider de compute na rede Burd.

[![release](https://img.shields.io/github/v/release/Burd-repo/desktop-application.svg)](https://github.com/Burd-repo/desktop-application/releases)
[![stars](https://img.shields.io/github/stars/Burd-repo/desktop-application)](https://github.com/Burd-repo/desktop-application/stargazers)
[![forks](https://img.shields.io/github/forks/Burd-repo/desktop-application)](https://github.com/Burd-repo/desktop-application/forks)
[![license](https://img.shields.io/github/license/Burd-repo/desktop-application)](https://github.com/Burd-repo/desktop-application/blob/main/LICENSE)

</div>

---

## Sumário

* [Visão geral](#visão-geral)
* [Início rápido](#início-rápido)
* [Binário do Agent](#binário-do-agent)
* [Rodando a aplicação](#rodando-a-aplicação)
* [Validação do Provider](#validação-do-provider)
* [Estados de validação](#estados-de-validação)
* [API local](#api-local)
* [Autenticação local](#autenticação-local)
* [Benchmark e readiness](#benchmark-e-readiness)
* [Regras de segurança](#regras-de-segurança)
* [Regras de desenvolvimento](#regras-de-desenvolvimento)
* [Diretrizes para Pull Request](#diretrizes-para-pull-request)
* [Checklist de Pull Request](#checklist-de-pull-request)
* [Convenção de commits](#convenção-de-commits)
* [Notas para mantenedores](#notas-para-mantenedores)
* [Licença](#licença)

---

## Visão geral

O Burd Desktop Application fornece uma interface local para validação de máquinas que desejam atuar como providers.

O app é responsável por:

* iniciar e monitorar o Burd Agent local;
* verificar a disponibilidade da API local;
* lidar com autenticação local;
* validar a identidade da máquina;
* executar verificação de hardware;
* executar benchmark;
* gerar relatório assinado;
* executar e verificar challenge local;
* executar provider verification;
* atualizar readiness;
* exibir resultados técnicos de forma clara.

A ação principal da tela Provider é:

```txt
Verificar minha máquina
```

O fluxo principal deve ser simples. Ferramentas técnicas podem existir, mas devem permanecer como recursos secundários.

---

## Início rápido

```bash
git clone https://github.com/Burd-repo/desktop-application.git
cd desktop-application
npm install
npm run sync:agent
npm run tauri dev
```

Antes de abrir um Pull Request, rode:

```bash
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Binário do Agent

O app espera encontrar o binário local do Burd Agent em:

```txt
src-tauri/binaries/burd-agent.exe
```

Para sincronizar o binário do agent com o app:

```bash
npm run sync:agent
```

Para gerar build já sincronizando o agent:

```bash
npm run tauri:build:with-agent
```

Não renomeie o binário para nomes genéricos como:

```txt
agent.exe
```

O nome esperado é:

```txt
burd-agent.exe
```

---

## Rodando a aplicação

### Desenvolvimento

```bash
npm run tauri dev
```

### Build do frontend

```bash
npm run build
```

### Build do app

```bash
npm run tauri build
```

### Typecheck

```bash
npm run typecheck
```

### Verificação da camada nativa

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Validação do Provider

A tela Provider conduz a validação local da máquina.

O fluxo principal é:

```txt
Agent
→ Autenticação
→ Identidade
→ Hardware
→ Benchmark
→ Relatório assinado
→ Challenge
→ Provider verification
→ Readiness
```

O usuário não deve precisar executar cada etapa manualmente.

Ações manuais podem existir, mas devem ficar em uma área avançada.

---

## Estados de validação

A tela Provider deve manter um estado principal coerente.

Estados aceitos:

```txt
offline
api_protegida
token_invalido
ocioso
validando
sucesso
parcial
falha
```

Regras:

* se o agent local estiver online, não mostrar `Agent não encontrado`;
* se a API local exigir token, mostrar estado de autenticação;
* se um endpoint protegido retornar `401`, não tratar como offline;
* se um endpoint retornar `404`, tratar como incompatibilidade de contrato ou versão;
* se o readiness estiver parcial, mostrar as pendências reais;
* se o readiness estiver pronto localmente, mostrar o estado final de sucesso.

A tela nunca deve exibir estados contraditórios, como:

```txt
Agent Online
Burd Agent não encontrado
```

ou:

```txt
Readiness concluído
Validação falhou
```

---

## API local

O app conversa com o Burd Agent pela API local:

```txt
http://127.0.0.1:8787
```

O app deve aceitar:

```txt
http://127.0.0.1:8787/*
http://localhost:8787/*
```

A permissão HTTP do Tauri deve liberar explicitamente essas URLs.

Exemplo:

```json
{
  "identifier": "http:default",
  "allow": [
    { "url": "http://127.0.0.1:8787/*" },
    { "url": "http://localhost:8787/*" }
  ]
}
```

---

## Autenticação local

Algumas rotas da API local exigem Bearer token.

Regras:

* não criar token ao abrir a tela Provider;
* não rotacionar token durante polling passivo;
* criar ou rotacionar token apenas após ação explícita do usuário;
* manter tokens somente em memória/runtime;
* nunca exibir tokens na interface;
* nunca registrar tokens em logs;
* nunca commitar tokens.

Uma resposta `401 token required` significa:

```txt
API local protegida
```

Não significa:

```txt
Agent offline
```

---

## Benchmark e readiness

O app não deve tratar score em cache, score parcial, fallback ou histórico antigo como benchmark completo.

Se o benchmark estiver parcial, indisponível, pulado ou usando fallback, a interface deve mostrar isso com clareza.

Estados permitidos para subtestes:

```txt
passou
atenção
pulado
indisponível
fallback
falhou
pendente
rodando
```

O readiness deve refletir a condição final real:

```txt
Pronto localmente
Parcial
Falhou
```

Se o readiness ficar parcial, liste os checks pendentes em vez de mostrar uma falha genérica.

---

## Regras de segurança

Nunca exponha, registre em log ou commite:

```txt
private_key
private_key_path
secret_key_base64
api_token
api_token_hash
Authorization header
credentials
password
valor bruto de token
```

Rótulos seguros são permitidos:

```txt
configurado
ausente
inválido
rotacionado
ativado
desativado
```

Logs técnicos não devem conter segredos.

---

## Regras de desenvolvimento

### Nomenclatura de arquivos

Use `kebab-case` para arquivos.

Exemplos:

```txt
provider-screen.tsx
burd-agent-client.ts
agent-manager-client.ts
use-burd-agent.ts
use-agent-manager.ts
window-titlebar.tsx
app-shell.tsx
```

Evite nomes de arquivo em PascalCase ou camelCase.

---

### Estados da interface

A tela Provider deve ter sempre:

* um estado principal;
* uma mensagem principal;
* uma ação principal.

Não crie múltiplas mensagens concorrentes para o mesmo erro.

Não transforme erro de token em erro de conexão.

Não transforme erro de endpoint em agent offline.

Não marque uma etapa como concluída se o dado usado for antigo, parcial ou indefinido.

---

### Ferramentas avançadas

Ações manuais devem ficar como ferramentas secundárias.

Exemplos:

```txt
Iniciar Agent
Reiniciar Agent
Ver logs
Raw Data
Ferramentas técnicas
```

Essas ações não devem substituir o fluxo principal de validação.

---

## Diretrizes para Pull Request

Antes de abrir um Pull Request, confirme:

* a alteração tem um objetivo claro;
* a tela Provider continua com uma ação principal simples;
* a interface não mostra estados contraditórios;
* erros da API local são classificados corretamente;
* tokens e segredos não aparecem na interface;
* logs não expõem dados sensíveis;
* pastas geradas não foram commitadas;
* arquivos temporários não foram commitados;
* o caminho do binário do agent não foi alterado sem necessidade;
* a validação local não depende de serviço remoto ausente.

Rode:

```bash
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

Se a mudança afetar a validação do Provider, teste manualmente o fluxo da tela Provider.

---

## Checklist de Pull Request

* [ ] A alteração tem propósito claro.
* [ ] O typecheck passa.
* [ ] A verificação da camada nativa passa.
* [ ] O estado da tela Provider permanece coerente.
* [ ] Nenhum segredo é exposto.
* [ ] Nenhum token é registrado em log.
* [ ] Nenhuma pasta gerada foi commitada.
* [ ] Nenhum arquivo temporário foi commitado.
* [ ] Arquivos novos usam `kebab-case`.
* [ ] A mensagem de commit segue a convenção do projeto.
* [ ] A ação principal de validação continua simples para o usuário.

---

## Não commitar

Não commite:

```txt
node_modules/
dist/
build/
target/
src-tauri/target/
tmp/
logs/
.env
.env.*
*.log
challenge.json
signed-response.json
```

Não commite segredos locais, estado local, credenciais, tokens, relatórios gerados ou arquivos temporários de challenge.

---

## Convenção de commits

Use mensagens semânticas curtas:

```txt
tipo: descrição curta
```

Tipos aceitos:

```txt
feat
fix
docs
style
chore
test
perf
refactor
```

Exemplos:

```txt
feat: adiciona fluxo de validação local
fix: corrige estado de readiness do provider
fix: resolve autenticação da API local
docs: atualiza readme do app desktop
chore: atualiza permissões do tauri
refactor: simplifica lógica de estado do provider
```

Evite mensagens genéricas como:

```txt
update
ajustes
correções
final
```

---

## Notas para mantenedores

Ao revisar mudanças, preste atenção especial em:

* transições de estado da tela Provider;
* autenticação da API local;
* lógica de readiness;
* persistência de challenge;
* geração de relatório assinado;
* resolução do binário do agent;
* permissões HTTP do Tauri;
* logs e remoção de segredos.

Um Pull Request que introduza estado confuso, exposição de token ou fluxo principal manual demais não deve ser mesclado.

---

## Licença

Este projeto é licenciado sob a licença **MIT**.

Consulte o arquivo [`LICENSE`](./LICENSE) para mais detalhes.
