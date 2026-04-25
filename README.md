# Alert.ia | Assistente de Triagem com IA

![Versão](https://img.shields.io/badge/version-1.9.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)

> **NOTA DE PORTFÓLIO:** > Este é um projeto desenvolvido para um ecossistema corporativo fechado (Service Desk). O código está disponível aqui como **Showcase** das minhas habilidades em JavaScript, desenvolvimento de Extensões Chrome, Interceptação de Rede (XHR/Fetch) e Integração com IAs generativas. Por questões de segurança, a execução plena depende de ambiente autenticado.

## Sobre o Projeto
O **Alert.ia** é uma extensão de produtividade focada em automatizar e otimizar o fluxo de atendimento. Usando o conceito de *Vibe Coding*, a ferramenta lê as mensagens dos pacientes em tempo real e utiliza inteligência artificial para sugerir a transferência imediata para o assistente ou setor correto, reduzindo erros humanos e tempo de triagem.

## Funcionalidades Chave

* **Motor de IA (Gemini):** Integração com a API do Google Gemini. Ele lê o histórico do chat e sugere o especialista ideal, contando com um sistema de fallback automático entre os modelos `2.5-flash` e `3.1-flash-lite` para garantir disponibilidade.
* **Varredura Stealth (Bridge):** Um script invisível (`page-bridge.js`) faz o *hook* direto nas requisições da plataforma original, capturando os dados na raiz de forma muito mais estável que um simples web scraping.
* **UI Moderna e Injetada:** Interface centralizada em um Floating Action Button (FAB) com estados dinâmicos (idle, load, alert). Traz um design com *glassmorphism* e Toasts de alerta visual e sonoro.
* **Analytics e Feedback:** Envio de métricas de conversão para o Firebase/Firestore. O sistema rastreia se a sugestão da IA foi realmente aceita pelo agente humano.

## Tech Stack

| Categoria | Tecnologia |
| :--- | :--- |
| **Core** | Vanilla JavaScript, CSS3 (Custom Properties) |
| **Ecossistema** | Google Chrome Extensions API (Manifest V3) |
| **Inteligência** | Google Gemini API |
| **Database** | Firebase Firestore (REST API) |

## Estrutura Básica

* `manifest.json`: Configurações e permissões (Manifest V3).
* `content.js`: Injeção da UI, controle de estados e comunicação principal.
* `page-bridge.js`: Interceptador de XHR/Fetch no contexto da página alvo.
* `service-worker.js`: Processamento em background, comunicação com a API do Gemini e Firestore.
* `styles.css`: Estilização e animações.
* `icons/` e `sounds/`: Assets visuais e de áudio do alerta.

## Teste Local (Apenas para Devs Autorizados)

1. Clone o repositório.
2. Adicione sua própria `GEMINI_API_KEY` no arquivo `service-worker.js`.
3. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta raiz.
5. Inicie um atendimento na plataforma alvo.

---
Desenvolvido por *Drecko*
