# Burd App

O `burd-app` e a aplicacao desktop/local da Burd para onboarding, validacao de provider e acompanhamento tecnico da maquina.

Ele usa:

- Tauri
- React + TypeScript
- Tailwind CSS
- Rust no backend local do app

O app conversa com o `burd-agent.exe` local por `http://127.0.0.1:8787`.

## O que o app ja faz

- fluxo inicial do produto;
- console tecnico local para provider;
- start/stop/restart do Burd Agent pela interface;
- leitura de hardware, score, readiness, payload de registro, historico, pricing, earnings, logs e raw data;
- fluxo guiado local:
  - identidade;
  - benchmark;
  - relatorio assinado;
  - challenge;
  - readiness local.

## Instalar dependencias

```bash
npm install
```

## Desenvolvimento

1. Buildar o benchmark:

```bash
cd F:\Burd\benchmark
cargo build
```

ou:

```bash
cargo build --release
```

2. Sincronizar o agent no app:

```bash
cd F:\Burd\app
npm run sync:agent
```

3. Rodar o app:

```bash
npm run tauri dev
```

Em desenvolvimento, o app tenta localizar o `burd-agent.exe` nesta ordem:

1. `src-tauri\binaries\burd-agent.exe`;
2. `BURD_AGENT_PATH`, se existir;
3. fallback local para `benchmark\target\release`;
4. fallback local para `benchmark\target\debug`;
5. recurso empacotado do Tauri, se existir para o modo atual.

No modo avancado da Provider Screen, o app tambem mostra diagnostico do binario
resolvido, incluindo origem, tamanho, `SHA-256`, comando usado e comparacao com o
`benchmark\target\release\burd-agent.exe`.

## Build final

1. Buildar o benchmark em release:

```bash
cd F:\Burd\benchmark
cargo build --release
```

2. Sincronizar o binario no app:

```bash
cd F:\Burd\app
npm run sync:agent
```

3. Gerar build do app:

```bash
npm run tauri build
```

ou:

```bash
npm run tauri:build:with-agent
```

## Como o binario e empacotado

O script `npm run sync:agent` copia o binario encontrado do benchmark para:

```text
src-tauri/binaries/burd-agent.exe
```

No build do Tauri, essa pasta e empacotada como recurso do app. Assim, o Burd App pode iniciar:

```text
burd-agent.exe serve --host 127.0.0.1 --port 8787
```

sem depender de terminal aberto no fluxo normal do usuario.

## Scripts principais

```bash
npm run dev
npm run sync:agent
npm run typecheck
npm run build
npm run tauri dev
npm run tauri build
npm run tauri:build:with-agent
```

## Observacoes

- nao ha auth real nesta fase;
- nao ha marketplace real;
- nao ha billing real;
- pricing e earnings continuam demonstrativos;
- raw data e logs nao exibem segredos sensiveis;
- o app so para processos do Burd Agent iniciados por ele mesmo.
