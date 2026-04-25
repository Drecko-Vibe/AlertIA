(() => {
  const BRIDGE_SOURCE = 'ASSISTENT_ALERT_BRIDGE';
  const state = {
    debug: false,
    ui: null,
    bridgeReady: false,
    analyzing: false,
    activeSessionId: null,
    activeProtocol: null,
    lastSessionObjects: new Map(),
    startedSessions: new Map(),
    hideToastTimer: null,
    currentAnalyzeNonce: 0,
    lastResult: null
  };

  const ASSISTANTS_INFO = [
    { name: 'Atena', color: '#6B21A8', desc: 'Configuração de confirmações e alertas consulta. Relatórios envio.<br><br><b>NÃO:</b> Falhas técnicas ou cobranças.' },
    { name: 'Blake', color: '#C084FC', desc: 'Estoque: produtos, entrada, consumo, devolução, relatórios.<br><br><b>NÃO:</b> Erros estoque ou valores módulo.' },
    { name: 'Lexie', color: '#BE185D', desc: 'Configurações: clínica, agenda, documentos, tabelas, anamnese.<br><br><b>NÃO:</b> Suporte técnico ou erros.' },
    { name: 'Mark', color: '#60A5FA', desc: 'Profissionais: cadastro, editar, vincular usuário, agenda trabalho.<br><br><b>NÃO:</b> Senhas ou falha acesso.' },
    { name: 'Otto', color: '#166534', desc: 'Pacientes: cadastro, editar, excluir, relatórios, convênios.<br><br><b>NÃO:</b> Erros ou importação dados.' },
    { name: 'Rick', color: '#4ADE80', desc: 'Caixa e Contas: abrir/fechar, entradas/saídas, contas pagar, fluxo caixa.<br><br><b>NÃO:</b> Erros valor ou divergência.' },
    { name: 'Stella', color: '#F9A8D4', desc: 'Agenda: criar, editar, remarcar, desmarcar, relatórios.<br><br><b>NÃO:</b> Atena, Lexie ou agendamentos sumidos.' },
    { name: 'Steve', color: '#2563EB', desc: 'Financeiro paciente: lançamentos, checkout, parcelas, juros, recebimentos.<br><br><b>NÃO:</b> Bugs, Clinipay ou NF.' }
  ];

  init();

  async function init() {
    injectBridge();
    const config = await chrome.runtime.sendMessage({ type: 'AA_GET_CONFIG' });
    state.debug = Boolean(config?.debug);
    createUi(config);
    bindBridgeEvents();
  }

  function injectBridge() {
    if (document.getElementById('aa-page-bridge')) return;
    const script = document.createElement('script');
    script.id = 'aa-page-bridge';
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  function bindBridgeEvents() {
    window.addEventListener('message', async (event) => {
      if (event.source !== window || !event.data || event.data.source !== BRIDGE_SOURCE) return;
      const { type, payload } = event.data;
      if (state.debug) console.debug('[Alert.ia][bridge]', type, payload);

      if (type === 'AA_BRIDGE_READY') return;
      if (type === 'AA_UNASSIGN_SESSION') {
        if (payload?.sessionId) state.startedSessions.set(payload.sessionId, { queued: true, sessionId: payload.sessionId });
        return;
      }
      if (type === 'AA_START_SESSION') return onStartSession(payload);
      if (type === 'AA_SESSION_OBJECT' || type === 'AA_FETCH_SESSION_RESULT') return onSessionObject(payload);
      if (type === 'AA_SESSION_MESSAGES') return onSessionMessages(payload);
      
      if (type === 'AA_SESSION_TRANSFERRED') {
        chrome.runtime.sendMessage({ type: 'AA_SESSION_TRANSFERRED', payload });
        return;
      }
    });
  }

  function createUi(config) {
    const assistantColors = config?.assistantColors || {};
    const root = document.createElement('div');
    root.id = 'aa-root';
    
    const accordionHtml = ASSISTANTS_INFO.map(ast => `
      <div class="aa-accordion-item">
        <div class="aa-accordion-header">
          <div class="aa-avatar" style="background: ${ast.color}">${ast.name.charAt(0)}</div>
          <span class="aa-assistant-name">${ast.name}</span>
          <span class="aa-chevron">▼</span>
        </div>
        <div class="aa-accordion-body">
          <div class="aa-accordion-content">${ast.desc}</div>
        </div>
      </div>
    `).join('');

    const versionTag = `<span class="aa-version-tag">v${config?.localVersion || '1.0.0'}</span>`;
    const alertIcon = config?.updateAvailable 
      ? `<a href="LINK_DRIVE_UPD" target="_blank" class="aa-update-icon" title="Nova Versão Disponível">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
             <line x1="12" y1="9" x2="12" y2="13"></line>
             <line x1="12" y1="17" x2="12.01" y2="17"></line>
           </svg>
         </a>` 
      : '';

    root.innerHTML = `
      <div id="aa-toast" class="aa-hidden" role="status" aria-live="polite">
        <div class="aa-toast-header">
          <div class="aa-toast-header-left">
            <span class="aa-live-dot"></span>
            <div class="aa-toast-title"></div>
          </div>
          <button id="aa-toast-close" type="button" aria-label="Fechar alerta">×</button>
        </div>
        <div class="aa-toast-grid">
          <span>Protocolo:</span><strong class="aa-protocol">-</strong>
          <span>Assistente:</span><strong class="aa-assistant">-</strong>
          <span>Confiança:</span><strong class="aa-confidence">-</strong>
          <span>Motivo:</span><strong class="aa-reason">-</strong>
        </div>
      </div>

      <div id="aa-menu" class="aa-hidden">
        <div class="aa-menu-header">
          <div>
            <div class="aa-menu-title">Assistentes Disponíveis ${versionTag} ${alertIcon}</div>
            <div class="aa-menu-subtitle">Clique para ver detalhes</div>
          </div>
          <button id="aa-btn-history" type="button" title="Ver último alerta">👁</button>
        </div>
        <div class="aa-menu-list">
          ${accordionHtml}
        </div>
        <div class="aa-menu-footer">
          <button id="aa-btn-reset" class="aa-btn-footer" type="button" title="Limpar Cache">
            ⚡ Limpar
          </button>
          <button id="aa-btn-ignore" class="aa-btn-footer" type="button" title="Ignorar Protocolo Atual">
            ⛔ Ignorar
          </button>
        </div>
      </div>

      <button id="aa-fab" type="button" title="Alert.ia">
        <span class="aa-fab-pulse"></span>
        <span class="aa-icon aa-icon-check">✓</span>
        <span class="aa-icon aa-icon-loader"></span>
        <span class="aa-icon aa-icon-alert">⚡</span>
      </button>
      <div id="aa-feedback" class="aa-hidden">Leitura reiniciada</div>
    `;
    document.documentElement.appendChild(root);

    state.ui = {
      root,
      fab: root.querySelector('#aa-fab'),
      menu: root.querySelector('#aa-menu'),
      btnReset: root.querySelector('#aa-btn-reset'),
      btnIgnore: root.querySelector('#aa-btn-ignore'),
      btnHistory: root.querySelector('#aa-btn-history'),
      toast: root.querySelector('#aa-toast'),
      feedback: root.querySelector('#aa-feedback'),
      close: root.querySelector('#aa-toast-close'),
      title: root.querySelector('.aa-toast-title'),
      protocol: root.querySelector('.aa-protocol'),
      assistant: root.querySelector('.aa-assistant'),
      confidence: root.querySelector('.aa-confidence'),
      reason: root.querySelector('.aa-reason'),
      assistantColors
    };

    state.ui.fab.addEventListener('click', toggleMenu);
    state.ui.btnReset.addEventListener('click', resetExtension);
    state.ui.btnIgnore.addEventListener('click', ignoreProtocol);
    state.ui.btnHistory.addEventListener('click', restoreLastAlert);
    state.ui.close.addEventListener('click', hideToast);

    const accordions = root.querySelectorAll('.aa-accordion-header');
    accordions.forEach(acc => {
      acc.addEventListener('click', function() {
        const item = this.parentElement;
        const body = item.querySelector('.aa-accordion-body');
        
        root.querySelectorAll('.aa-accordion-item.aa-expanded').forEach(openItem => {
          if (openItem !== item) {
            openItem.classList.remove('aa-expanded');
            openItem.querySelector('.aa-accordion-body').style.maxHeight = null;
          }
        });

        if (item.classList.contains('aa-expanded')) {
          item.classList.remove('aa-expanded');
          body.style.maxHeight = null;
        } else {
          item.classList.add('aa-expanded');
          body.style.maxHeight = body.scrollHeight + "px";
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!state.ui.root.contains(e.target) && state.ui.menu.classList.contains('aa-menu-open')) {
        toggleMenu();
      }
    });

    setFabState('idle');
  }

  function toggleMenu() {
    state.ui.menu.classList.toggle('aa-menu-open');
    if (state.ui.menu.classList.contains('aa-menu-open')) {
       state.ui.toast.classList.add('aa-hidden');
    }
  }

  function setFabState(status) {
    if (state.ui) state.ui.fab.dataset.state = status;
  }

  function showFeedback(text) {
    state.ui.feedback.textContent = text;
    state.ui.feedback.classList.remove('aa-hidden');
    window.clearTimeout(state.ui.feedbackTimer);
    state.ui.feedbackTimer = window.setTimeout(() => state.ui.feedback.classList.add('aa-hidden'), 1700);
  }

  async function resetExtension() {
    if (!state.ui) return;
    state.ui.btnReset.style.opacity = '0.7';
    setTimeout(() => state.ui.btnReset.style.opacity = '1', 150);

    try {
      await chrome.runtime.sendMessage({ type: 'AA_RESET' });
      state.startedSessions.clear();
      state.lastSessionObjects.clear();
      state.activeSessionId = null;
      state.activeProtocol = null;
      state.analyzing = false;
      
      toggleMenu();
      hideToast();
      setFabState('idle');
      showFeedback('Leitura reiniciada');
    } catch (error) {
      if (state.debug) console.error('[Alert.ia] Erro reset:', error);
    }
  }

  async function ignoreProtocol() {
    if (!state.ui) return;
    state.ui.btnIgnore.style.opacity = '0.7';
    setTimeout(() => state.ui.btnIgnore.style.opacity = '1', 150);

    if (!state.activeProtocol) {
      showFeedback('Nenhum protocolo ativo');
      return;
    }

    try {
      await chrome.runtime.sendMessage({ type: 'AA_IGNORE_PROTOCOL', payload: { protocol: state.activeProtocol } });
      toggleMenu();
      hideToast();
      showFeedback('Protocolo ignorado');
    } catch (error) {
      if (state.debug) console.error('[Alert.ia] Erro ignorar:', error);
    }
  }

  function hideToast() {
    if (!state.ui) return;
    state.ui.toast.classList.add('aa-hidden');
    state.ui.toast.dataset.kind = '';
    if (!state.analyzing) setFabState('idle');
  }

  function showToast(result, isRecall = false) {
    state.lastResult = result;
    const isManual = result.decision === 'manual_review';
    state.ui.title.textContent = isManual ? 'REVISÃO MANUAL' : 'SUGESTÃO DE TRANSFERÊNCIA';
    state.ui.protocol.textContent = result.protocol || '-';
    state.ui.assistant.textContent = result.assistant || '-';
    state.ui.assistant.style.color = result.color || state.ui.assistantColors[result.assistant] || '#fff';
    state.ui.confidence.textContent = `${Number(result.confidence || 0).toFixed(1)}%`;
    state.ui.reason.textContent = result.reason || 'Sem motivo.';
    state.ui.toast.dataset.kind = isManual ? 'manual' : 'alert';
    state.ui.toast.classList.remove('aa-hidden');
    setFabState('alert');
    if (!isRecall) playAlertSound();
    window.clearTimeout(state.hideToastTimer);
    state.hideToastTimer = window.setTimeout(hideToast, 25000);
  }

  function restoreLastAlert() {
    if (state.lastResult) {
      toggleMenu();
      showToast(state.lastResult, true);
    } else {
      showFeedback('Nenhum alerta recente');
    }
  }

  function playAlertSound() {
    const audio = new Audio(chrome.runtime.getURL('sounds/alert.wav'));
    audio.volume = 0.55;
    audio.play().catch(() => {});
  }

  async function onStartSession(payload) {
    if (!payload?.sessionId) return;
    state.startedSessions.set(payload.sessionId, {
      sessionId: payload.sessionId,
      protocol: payload.protocol || null,
      clinicId: payload.clinicId || null
    });
  }

  async function onSessionMessages(payload) {
    const sessionId = String(payload.sessionId || '');
    if (!sessionId) return;

    window.clearTimeout(state.hideToastTimer);
    hideToast();
    
    state.analyzing = true;
    state.activeSessionId = sessionId;
    setFabState('analyzing');

    const rawArray = Array.isArray(payload.messages) ? payload.messages : [];
    rawArray.sort((a, b) => new Date(a.DateTime || 0) - new Date(b.DateTime || 0));

    // FILTRO BLINDADO CONTRA MUDANÇAS DA CLINICORP
    const clientMessages = rawArray.filter(item => {
      const msgText = item.Body || item.body || item.text || item.message;
      if (!item || !msgText) return false;
      
      const sender = String(item.Sender || item.sender || '').toUpperCase();
      const receiver = String(item.Receiver || item.receiver || '').toUpperCase();

      if (sender === 'SUPPORT') return false;
      if (receiver === 'SUPPORT') return true;
      if (sender && sender !== 'SUPPORT') return true;

      return false;
    }).map(item => String(item.Body || item.body || item.text || item.message).trim()).filter(Boolean);

    if (clientMessages.length === 0) {
      state.analyzing = false;
      setFabState('idle');
      return;
    }

    const selectedMessages = clientMessages.slice(-10);

    const started = state.startedSessions.get(sessionId) || {};
    const obj = state.lastSessionObjects.get(sessionId) || {};
    const protocol = started.protocol || obj.protocol || null;
    const clinicId = started.clinicId || obj.clinicId || null;

    window.clearTimeout(state.waitSessionTimer);
    state.currentAnalyzeNonce += 1;
    const currentNonce = state.currentAnalyzeNonce;

    state.waitSessionTimer = window.setTimeout(() => {
      triggerAnalysis({
        sessionId,
        protocol,
        clinicId,
        messages: selectedMessages,
        lastMessage: ''
      }, currentNonce);
    }, 800);
  }

  function requestSessionFetch(sessionId) {
    window.postMessage({ source: 'ASSISTENT_ALERT_CONTENT', type: 'AA_FETCH_SESSION', payload: { sessionId } }, '*');
  }

  async function onSessionObject(payload) {
    if (!payload?.sessionId) return;
    state.lastSessionObjects.set(payload.sessionId, payload);
  }

  function deriveMessages(payload) {
    const raw = [];
    if (Array.isArray(payload.messages)) {
      const textMessages = payload.messages.map(m => typeof m === 'string' ? m : m.text);
      raw.push(...textMessages);
    }
    if (payload.lastMessage) {
      raw.push(typeof payload.lastMessage === 'string' ? payload.lastMessage : payload.lastMessage.text);
    }
    return raw.filter(Boolean);
  }

  async function triggerAnalysis(input, nonce) {
    if (nonce !== state.currentAnalyzeNonce) return;

    const messages = deriveMessages(input);

    let nomeUsuarioTela = "Desconhecido";
    document.querySelectorAll('span').forEach(elemento => {
      const classes = typeof elemento.className === 'string' ? elemento.className : '';
      if (classes.includes('text-[13px]') && classes.includes('font-semibold') && classes.includes('text-white/90')) {
        nomeUsuarioTela = elemento.innerText.trim();
      }
    });

    let idClinicaTela = "Desconhecida";
    document.querySelectorAll('div, span, b').forEach(elemento => {
      const txt = elemento.innerText.trim();
      if (txt.startsWith('@') && txt.length > 2 && txt.length < 30 && !txt.includes(' ')) {
        idClinicaTela = txt;
      }
    });

    // EXTRAÇÃO SEGURA DO PROTOCOLO BASEADA NO SESSION ID
    let protocoloReal = String(input.sessionId || input.protocol || "sem_protocolo").replace(/[^a-zA-Z0-9_-]/g, '');

    state.activeProtocol = protocoloReal;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AA_ANALYZE_SESSION',
        payload: {
          sessionId: input.sessionId,
          protocol: protocoloReal,
          clinicId: input.clinicId,
          messages,
          lastMessage: messages[messages.length - 1] || '',
          nomeUsuarioTela: nomeUsuarioTela,
          idClinicaTela: idClinicaTela
        }
      });

      if (nonce !== state.currentAnalyzeNonce) return;
      
      state.startedSessions.delete(input.sessionId);
      state.lastSessionObjects.delete(input.sessionId);

      if (!response?.ok) {
        hideToast();
        return;
      }

      const result = response.result;
      if (result?.decision === 'transfer' || result?.decision === 'manual_review') {
        showToast(result);
        return;
      }

      hideToast();
    } catch (error) {
       hideToast();
    } finally {
       if (nonce === state.currentAnalyzeNonce) {
           state.analyzing = false;
           if (state.ui && state.ui.fab.dataset.state !== 'alert') {
               setFabState('idle');
           }
       }
    }
  }
})();