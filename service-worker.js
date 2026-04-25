const DEBUG_DEFAULT = false;
const GEMINI_API_KEY = 'SUA_CHAVE_API';
const MODEL_FALLBACK_ORDER = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite-preview'
];
const MODEL_TIMEOUT_MS = 10000;

const STORAGE_KEYS = {
  analyzedSessions: 'analyzedSessions',
  startedSessions: 'startedSessions',
  debug: 'debugMode',
  modelOrder: 'modelOrder',
  resetToken: 'resetToken',
  ignoredProtocols: 'ignoredProtocols',
  updateAvailable: 'updateAvailable'
};

async function checkExtensionUpdate() {
  const projectId = "assistentalert";
  try {
    const response = await fetch(`FIREBASE_LINK`);
    const data = await response.json();
    
    const remoteVersion = data.fields.current_version.stringValue;
    const localVersion = chrome.runtime.getManifest().version;

    if (remoteVersion !== localVersion) {
      await chrome.storage.local.set({ [STORAGE_KEYS.updateAvailable]: remoteVersion });
    } else {
      await chrome.storage.local.set({ [STORAGE_KEYS.updateAvailable]: null });
    }
  } catch (err) {
    // Falha silenciosa
  }
}

chrome.alarms.create('checkUpdate', { periodInMinutes: 120 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUpdate') checkExtensionUpdate();
});
chrome.runtime.onStartup.addListener(checkExtensionUpdate);
chrome.runtime.onInstalled.addListener(checkExtensionUpdate);

const ASSISTANT_COLORS = {
  Steve: '#2563EB',
  Stella: '#F9A8D4',
  Lexie: '#BE185D',
  Rick: '#4ADE80',
  Atena: '#6B21A8',
  Mark: '#60A5FA',
  Otto: '#166534',
  Blake: '#C084FC'
};

const ASSISTANTS = {
  Steve: 'Financeiro paciente: lançamentos, checkout, parcelas, juros, recebimentos. NÃO: bugs, Clinipay, orçamentos ou NF.',
  Stella: 'Agenda: criar, editar, remarcar, desmarcar, relatórios. NÃO: Atena, Lexie ou agendamentos sumidos.',
  Lexie: 'Configurações: clínica, horários agenda, tabelas preço, anamnese, documentos. NÃO: erros técnicos ou suporte.',
  Rick: 'Caixa e Contas: abrir/fechar, entradas/saídas, contas pagar, fluxo caixa. NÃO: erros valor ou divergência caixa.',
  Atena: 'Confirmações: alertas consulta, relatórios envios. NÃO: falhas técnicas ou cobranças/planos.',
  Mark: 'Profissionais: cadastro, editar, vincular usuário, agenda trabalho. NÃO: login/senhas ou acessos.',
  Otto: 'Pacientes: cadastro, relatórios, convênios. NÃO: erros, importação dados ou falta de acesso.',
  Blake: 'Estoque: produtos, entradas, consumo, relatórios. NÃO: erros estoque ou valores módulo.'
};

const activeAbortControllers = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const state = await chrome.storage.local.get([
    STORAGE_KEYS.analyzedSessions,
    STORAGE_KEYS.startedSessions,
    STORAGE_KEYS.debug,
    STORAGE_KEYS.modelOrder,
    STORAGE_KEYS.resetToken,
    STORAGE_KEYS.ignoredProtocols
  ]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.analyzedSessions]: state[STORAGE_KEYS.analyzedSessions] || {},
    [STORAGE_KEYS.startedSessions]: state[STORAGE_KEYS.startedSessions] || {},
    [STORAGE_KEYS.debug]: state[STORAGE_KEYS.debug] ?? DEBUG_DEFAULT,
    [STORAGE_KEYS.modelOrder]: state[STORAGE_KEYS.modelOrder] || MODEL_FALLBACK_ORDER,
    [STORAGE_KEYS.resetToken]: state[STORAGE_KEYS.resetToken] || Date.now(),
    [STORAGE_KEYS.ignoredProtocols]: state[STORAGE_KEYS.ignoredProtocols] || []
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'AA_GET_CONFIG') {
    getRuntimeConfig().then(sendResponse);
    return true;
  }

  if (message.type === 'AA_RESET') {
    handleReset().then((result) => sendResponse({ ok: true, ...result }));
    return true;
  }

  if (message.type === 'AA_IGNORE_PROTOCOL') {
    handleIgnoreProtocol(message.payload).then((result) => sendResponse({ ok: true, ...result }));
    return true;
  }

  if (message.type === 'AA_ANALYZE_SESSION') {
    analyzeSession(message.payload, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === 'AA_SESSION_TRANSFERRED') {
    handleTransfer(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function getRuntimeConfig() {
  const state = await chrome.storage.local.get([
    STORAGE_KEYS.debug, 
    STORAGE_KEYS.modelOrder, 
    STORAGE_KEYS.updateAvailable
  ]);
  return {
    debug: state[STORAGE_KEYS.debug] ?? DEBUG_DEFAULT,
    modelOrder: state[STORAGE_KEYS.modelOrder] || MODEL_FALLBACK_ORDER,
    assistantColors: ASSISTANT_COLORS,
    updateAvailable: state[STORAGE_KEYS.updateAvailable],
    localVersion: chrome.runtime.getManifest().version
  };
}

async function handleReset() {
  for (const controller of activeAbortControllers.values()) controller.abort();
  activeAbortControllers.clear();
  const resetToken = Date.now();
  await chrome.storage.local.set({
    [STORAGE_KEYS.analyzedSessions]: {},
    [STORAGE_KEYS.startedSessions]: {},
    [STORAGE_KEYS.ignoredProtocols]: [],
    [STORAGE_KEYS.resetToken]: resetToken
  });
  return { resetToken };
}

async function handleIgnoreProtocol({ protocol }) {
  if (!protocol) return { success: false };
  const state = await chrome.storage.local.get([STORAGE_KEYS.ignoredProtocols]);
  const ignored = state[STORAGE_KEYS.ignoredProtocols] || [];
  if (!ignored.includes(String(protocol))) {
    ignored.push(String(protocol));
    await chrome.storage.local.set({ [STORAGE_KEYS.ignoredProtocols]: ignored });
  }
  return { success: true };
}

function buildIaPrompt({ protocol, clinicId, messages }) {
  const safeMessages = (messages || []).filter(Boolean);

  return {
    contents: [{
      role: 'user',
      parts: [{
        text: `Triagem Service Desk. Use JSON válido.
ESCOPOS: ${JSON.stringify(ASSISTANTS)}
REGRAS:
1. Erro técnico/Dados sumidos: "none".
2. Dúvida operacional/Como fazer: Direcionar assistente.
3. Nomes pacientes: Autorizado.
4. Mensalidade/Cobrança Clinicorp: "none".
5. Múltiplos assuntos: Use " e ".
6. Confiança 0-100.
DADOS: ${JSON.stringify({
  protocol,
  messages: safeMessages,
  output: {
    thought: 'Intenções encontradas.',
    assistant: 'Nome ou none',
    confidence: '0-100',
    reason: 'Resumo'
  }
})}`
      }]
    }],
    generationConfig: {
      temperature: 0.0,
      topP: 0.8,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json'
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };
}

async function callGeminiWithFallback(body, debug = false, sessionId = 'global') {
  const models = MODEL_FALLBACK_ORDER;
  const errors = [];

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    activeAbortControllers.set(sessionId, controller);

    try {
      const response = await fetch(`LINK_API`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        errors.push({ model, status: response.status, error: errorText.slice(0, 300) });
        continue; 
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
      if (!text) {
        errors.push({ model, status: 'empty', error: 'Resposta vazia.' });
        continue; 
      }

      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);
      return { parsed, model, errors };
    } catch (error) {
      errors.push({ model, status: error.name === 'AbortError' ? 'timeout' : 'fetch_error', error: error.message || String(error) });
      continue;
    } finally {
      clearTimeout(timer);
      activeAbortControllers.delete(sessionId);
    }
  }

  if (debug) console.warn('[Alert.ia] Falha nos modelos:', errors);
  throw new Error('Nenhum modelo retornou JSON válido.');
}

async function analyzeSession(payload) {
  const state = await chrome.storage.local.get([STORAGE_KEYS.debug, STORAGE_KEYS.analyzedSessions, STORAGE_KEYS.ignoredProtocols]);
  
  const debug = state[STORAGE_KEYS.debug] ?? DEBUG_DEFAULT;
  const analyzedSessions = state[STORAGE_KEYS.analyzedSessions] || {};
  const ignoredProtocols = state[STORAGE_KEYS.ignoredProtocols] || [];
  const sessionKey = payload.sessionId || payload.protocol || `session-${Date.now()}`;

  if (payload.protocol && ignoredProtocols.includes(String(payload.protocol))) {
    return { decision: 'ignore' };
  }

  payload.messages = (payload.messages || []).filter(m => {
    const txt = String(m).toLowerCase().trim();
    return txt !== 'retomar atendimento';
  });

  if (payload.messages.length === 0) {
    return { decision: 'ignore' };
  }

  const quantidadeMensagens = payload.messages.length;
  const mensagemMaisRecente = payload.messages[quantidadeMensagens - 1] || "";
  const cacheExistente = analyzedSessions[sessionKey];

  if (cacheExistente && 
      cacheExistente.messageCount === quantidadeMensagens && 
      cacheExistente.lastMessage === mensagemMaisRecente) {
    return { decision: 'ignore' };
  }

  let finalAssistant = 'none';
  let confidence = 0;
  let decision = 'ignore';
  let shortReason = 'Analisado.';
  let model = null;
  let modelErrors = [];
  let thoughtProcess = '';

  try {
    const ai = await callGeminiWithFallback(buildIaPrompt({
      protocol: payload.protocol,
      clinicId: payload.clinicId,
      messages: payload.messages
    }), debug, sessionKey);
    
    model = ai.model;
    modelErrors = ai.errors;
    
    const dadosIa = ai.parsed?.output || ai.parsed || {};

    thoughtProcess = dadosIa.thought_process || dadosIa.pensamento || dadosIa.thought || "";
    shortReason = dadosIa.reason || dadosIa.Reason || dadosIa.motivo || 'Sucesso.';

    const rawAssistant = String(dadosIa.assistant || dadosIa.Assistant || dadosIa.assistente || 'none');
    const validNames = ['Steve', 'Stella', 'Lexie', 'Rick', 'Atena', 'Mark', 'Otto', 'Blake'];
    const foundAssistants = validNames.filter(name => rawAssistant.toLowerCase().includes(name.toLowerCase()));
    
    if (foundAssistants.length === 1) {
      finalAssistant = foundAssistants[0];
    } else if (foundAssistants.length > 1) {
      finalAssistant = foundAssistants.join(' e ');
    }

    confidence = Number(dadosIa.confidence || dadosIa.Confidence || dadosIa.confianca || 0);
    if (confidence > 0 && confidence <= 1) confidence = confidence * 100;

    decision = confidence >= 70 ? 'transfer' : (confidence >= 60 ? 'manual_review' : 'ignore');

    if (confidence < 40 || finalAssistant === 'none') {
      decision = 'ignore';
    }

  } catch (error) {
    shortReason = 'Falha API: ' + (error.message || 'Erro');
    thoughtProcess = 'Abortado.';
    decision = 'ignore';
    finalAssistant = 'none';
    confidence = 0;
  }

  const isMultiple = finalAssistant.includes(' e ');
  const displayColor = isMultiple ? '#FFC857' : (ASSISTANT_COLORS[finalAssistant] || '#ffffff');

  const result = {
    sessionKey,
    protocol: payload.protocol || payload.sessionId,
    clinicId: payload.clinicId,
    messages: payload.messages,
    assistant: finalAssistant,
    confidence,
    reason: shortReason,
    decision,
    model,
    modelErrors,
    color: displayColor
  };

  analyzedSessions[sessionKey] = { 
    ts: Date.now(), 
    outcome: result.decision, 
    result,
    messageCount: quantidadeMensagens,
    lastMessage: mensagemMaisRecente
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.analyzedSessions]: analyzedSessions });

  const projectId = "assistentalert";
  const collectionName = "triagens"; 
  const ultimas5Mensagens = (payload.messages || []).slice(-5).join('\n—\n');

  const firestoreData = {
    fields: {
      usuario_id: { stringValue: String(payload.nomeUsuarioTela || payload.clinicId || "Desconhecido") },
      id_clinica: { stringValue: String(payload.idClinicaTela || "Desconhecida") },
      protocolo: { stringValue: String(payload.protocol || "sem_protocolo") },
      data_utilizacao: { stringValue: new Date().toISOString() },
      modelo_ia: { stringValue: String(model || "api_falhou") },
      pensamento_ia: { stringValue: String(thoughtProcess) },
      resposta_ia: { stringValue: String(shortReason) }, 
      confianca_ia: { integerValue: String(Math.round(confidence || 0)) },
      agente_sugerido: { stringValue: String(finalAssistant) },
      mensagens_cliente: { stringValue: String(ultimas5Mensagens || "Nenhuma mensagem legível") },
      transferido: { stringValue: "NÃO" },
      versao_extensao: { stringValue: String(chrome.runtime.getManifest().version) }
    }
  };

  const docId = String(payload.protocol || payload.sessionId || "sem_protocolo").replace(/[^a-zA-Z0-9_-]/g, '');
  const fieldsToUpdate = Object.keys(firestoreData.fields).map(f => `updateMask.fieldPaths=${f}`).join('&');

  await fetch(`LINK_API`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(firestoreData)
  }).catch(error => console.error("Erro banco:", error));

  return result;
}

async function handleTransfer({ sessionId, targetAgent }) {
  const projectId = "assistentalert";
  const collectionName = "triagens";
  let docId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');

  const state = await chrome.storage.local.get([STORAGE_KEYS.analyzedSessions]);
  const analyzedSessions = state[STORAGE_KEYS.analyzedSessions] || {};
  
  for (const key in analyzedSessions) {
    const result = analyzedSessions[key].result;
    if (result && (String(result.sessionKey) === String(sessionId) || String(result.protocol) === String(sessionId))) {
       docId = String(result.protocol || result.sessionKey).replace(/[^a-zA-Z0-9_-]/g, '');
       break;
    }
  }

  let cleanAgent = String(targetAgent).replace(/agent/gi, '').trim();

  const updateData = {
    fields: {
      acao_realizada: { stringValue: "Transferido" },
      agente_humano_escolheu: { stringValue: cleanAgent },
      transferido: { stringValue: "SIM" }
    }
  };

  // AWAIT OBRIGATÓRIO AQUI TAMBÉM!
  await fetch(`FIREBASE_LINK`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData)
  }).catch(err => console.error("Erro transferência:", err));
}