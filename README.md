# Alert.ia

Extensão interna para o Chrome, em Manifest V3, voltada ao domínio:

- `https://servicedesk.clinicorp.tech/*`

## O que ela faz

- observa `unassign_session`, `start_session`, `get_session_object`, `get_session_messages` e `create_task_transfer_session`
- dispara a análise cronológica das últimas mensagens no momento em que o agente clica para abrir a conversa do paciente
- grava a ação de transferência do agente no banco de dados para medir a taxa de conversão
- possui inteligência para identificar múltiplos assuntos (ex: "Lexie e Steve")
- bloqueia disparos desnecessários (como senhas e falhas no sistema) economizando tokens
- chama a IA como rede de segurança
- usa fallback automático entre os modelos Gemini configurados
- mostra alerta visual apenas quando a confiança exigir ação
- toca o som 1 vez
- esconde o alerta após 25 segundos
- permite ignorar protocolos ou limpar o cache via menu compacto

## Arquivos

- `manifest.json`
- `content.js`
- `page-bridge.js`
- `service-worker.js`
- `styles.css`
- `icons/`
- `sounds/alert.wav`

## Instalação no Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta da extensão
5. Abra `https://servicedesk.clinicorp.tech/`
6. Inicie um atendimento para testar

## Como testar

- abrir a fila normalmente
- clicar em **Atender**
- abrir a conversa do paciente para forçar o carregamento das mensagens
- conferir no DevTools da extensão se o `get_session_messages` foi capturado
- transferir a sessão e verificar se a métrica foi salva no Firestore
- testar frases com assuntos cruzados para validar a consolidação da IA

## Debug

Por padrão o debug está desligado.

Para ativar rápido no console da extensão/service worker:

```js
chrome.storage.local.set({ debugMode: true })
```

Para desligar:

```js
chrome.storage.local.set({ debugMode: false })
```