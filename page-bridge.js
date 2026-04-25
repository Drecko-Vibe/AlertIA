(() => {
  const TARGET = window;
  const OUT_SOURCE = 'ASSISTENT_ALERT_BRIDGE';
  const IN_SOURCE = 'ASSISTENT_ALERT_CONTENT';
  const sessionCache = new Map();

  TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_BRIDGE_READY' }, '*');

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== IN_SOURCE) return;
    if (event.data.type === 'AA_FETCH_SESSION') {
      const sessionId = event.data.payload?.sessionId;
      if (!sessionId) return;
      if (sessionCache.has(sessionId)) {
        TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_FETCH_SESSION_RESULT', payload: sessionCache.get(sessionId) }, '*');
        return;
      }
      try {
        const response = await window.fetch(`/get_session_object?sessionId=${encodeURIComponent(sessionId)}`, {
          method: 'GET',
          credentials: 'include'
        });
        const json = await response.clone().json();
        const parsed = extractSessionObject(json, { url: response.url, sessionId });
        if (parsed) {
          sessionCache.set(sessionId, parsed);
          TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_FETCH_SESSION_RESULT', payload: parsed }, '*');
        }
      } catch (error) {
        // noop
      }
    }
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const inputUrl = typeof request === 'string' ? request : request?.url;
    const method = (typeof request === 'object' && request?.method) || args[1]?.method || 'GET';
    const response = await originalFetch(...args);
    handleNetworkEvent({ url: inputUrl, method, request, init: args[1], response }).catch(() => {});
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__aaMethod = method;
    this.__aaUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    this.__aaBody = body;
    this.addEventListener('load', () => {
      const xhr = this;
      handleXhrEvent(xhr).catch(() => {});
    });
    return originalSend.call(this, body);
  };

  async function handleNetworkEvent({ url, method, request, init, response }) {
    if (!url) return;
    const parsedUrl = new URL(url, location.origin);
    const bodyText = await readRequestBody(request, init);

    if (parsedUrl.pathname.includes('unassign_session')) {
      const requestJson = safeJsonParse(bodyText);
      TARGET.postMessage({
        source: OUT_SOURCE,
        type: 'AA_UNASSIGN_SESSION',
        payload: { sessionId: requestJson?.sessionId || requestJson?.SessionId || null }
      }, '*');
      return;
    }

    if (parsedUrl.pathname.includes('create_task_transfer_session')) {
      const requestJson = safeJsonParse(bodyText);
      let targetAgent = 'Desconhecido';
      let sessionId = null;

      if (Array.isArray(requestJson)) {
        const sessionObj = requestJson.find(obj => obj.SessionId);
        if (sessionObj) sessionId = sessionObj.SessionId;

        const transferObj = requestJson.find(obj => obj.DirectTransfer);
        if (transferObj && transferObj.DirectTransfer.AgentName) {
          targetAgent = transferObj.DirectTransfer.AgentName;
        }
      } else if (requestJson) {
        sessionId = requestJson.SessionId;
        targetAgent = requestJson.DirectTransfer?.AgentName || 'Desconhecido';
      }

      if (sessionId) {
        TARGET.postMessage({
          source: OUT_SOURCE,
          type: 'AA_SESSION_TRANSFERRED',
          payload: { sessionId, targetAgent }
        }, '*');
      }
      return;
    }

    if (parsedUrl.pathname.includes('start_session')) {
      const responseJson = await safeReadJson(response);
      const requestJson = safeJsonParse(bodyText);
      const payload = extractStartSession(responseJson, requestJson);
      if (payload) {
        TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_START_SESSION', payload }, '*');
      }
      return;
    }

    if (parsedUrl.pathname.includes('get_session_object')) {
      const json = await safeReadJson(response);
      const sessionId = parsedUrl.searchParams.get('sessionId');
      const payload = extractSessionObject(json, { url: parsedUrl.toString(), sessionId });
      if (payload) {
        sessionCache.set(payload.sessionId, payload);
        TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_SESSION_OBJECT', payload }, '*');
      }
    }

    if (parsedUrl.pathname.includes('get_session_messages')) {
      const json = await safeReadJson(response);
      const sessionId = parsedUrl.searchParams.get('sessionId') || parsedUrl.searchParams.get('SessionId');
      if (json && sessionId) {
        TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_SESSION_MESSAGES', payload: { sessionId, messages: json } }, '*');
      }
    }
  }

  async function handleXhrEvent(xhr) {
    if (!xhr.__aaUrl) return;
    const parsedUrl = new URL(xhr.__aaUrl, location.origin);
    const requestJson = safeJsonParse(xhr.__aaBody);
    const responseJson = safeJsonParse(xhr.responseText);

    if (parsedUrl.pathname.includes('create_task_transfer_session')) {
      let targetAgent = 'Desconhecido';
      let sessionId = null;

      if (Array.isArray(requestJson)) {
        const sessionObj = requestJson.find(obj => obj.SessionId || obj.sessionId);
        if (sessionObj) sessionId = sessionObj.SessionId || sessionObj.sessionId;

        const transferObj = requestJson.find(obj => obj.DirectTransfer || obj.directTransfer);
        if (transferObj) {
          targetAgent = transferObj.DirectTransfer?.AgentName || transferObj.directTransfer?.agentName || 'Desconhecido';
        }
      } else if (requestJson) {
        sessionId = requestJson.SessionId || requestJson.sessionId;
        targetAgent = requestJson.DirectTransfer?.AgentName || requestJson.directTransfer?.agentName || 'Desconhecido';
      }

      if (sessionId) {
        TARGET.postMessage({
          source: OUT_SOURCE,
          type: 'AA_SESSION_TRANSFERRED',
          payload: { sessionId, targetAgent }
        }, '*');
      }
      return;
    }

    if (parsedUrl.pathname.includes('unassign_session')) {
      TARGET.postMessage({
        source: OUT_SOURCE,
        type: 'AA_UNASSIGN_SESSION',
        payload: { sessionId: requestJson?.sessionId || requestJson?.SessionId || null }
      }, '*');
      return;
    }

    if (parsedUrl.pathname.includes('start_session')) {
      const payload = extractStartSession(responseJson, requestJson);
      if (payload) TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_START_SESSION', payload }, '*');
      return;
    }

    if (parsedUrl.pathname.includes('get_session_object')) {
      const sessionId = parsedUrl.searchParams.get('sessionId');
      const payload = extractSessionObject(responseJson, { url: parsedUrl.toString(), sessionId });
      if (payload) {
        sessionCache.set(payload.sessionId, payload);
        TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_SESSION_OBJECT', payload }, '*');
      }
    }

    if (parsedUrl.pathname.includes('get_session_messages')) {
      const sessionId = parsedUrl.searchParams.get('sessionId') || parsedUrl.searchParams.get('SessionId');
      if (responseJson && sessionId) {
        TARGET.postMessage({ source: OUT_SOURCE, type: 'AA_SESSION_MESSAGES', payload: { sessionId, messages: responseJson } }, '*');
      }
    }
  }

  async function readRequestBody(request, init) {
    const candidate = init?.body || request?.body || null;
    if (!candidate) return '';
    if (typeof candidate === 'string') return candidate;
    if (candidate instanceof URLSearchParams) return candidate.toString();
    if (candidate instanceof FormData) {
      return JSON.stringify(Object.fromEntries(candidate.entries()));
    }
    try {
      const clone = request?.clone?.();
      if (clone) return await clone.text();
    } catch (error) {}
    return '';
  }

  async function safeReadJson(response) {
    try {
      return await response.clone().json();
    } catch (error) {
      return null;
    }
  }

  function safeJsonParse(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function extractStartSession(responseJson, requestJson) {
    const merged = [responseJson, requestJson].find(Boolean) || {};
    const sessionId = merged?.sessionId || merged?.SessionId || merged?.id || merged?.session?.id || null;
    const protocol = merged?.SessionProtocolNumber || merged?.sessionProtocolNumber || merged?.session?.SessionProtocolNumber || null;
    const clinicId = merged?.SubscriberUuid || merged?.subscriberUuid || merged?.session?.SubscriberUuid || null;
    if (!sessionId && !protocol) return null;
    return { sessionId, protocol, clinicId };
  }

  function extractSessionObject(json, meta = {}) {
    if (!json) return null;
    const sessionId = meta.sessionId || json?.sessionId || json?.SessionId || json?.data?.sessionId || null;
    const protocol = json?.SessionProtocolNumber || json?.session?.SessionProtocolNumber || json?.data?.SessionProtocolNumber || null;
    const clinicId = json?.SubscriberUuid || json?.session?.SubscriberUuid || json?.data?.SubscriberUuid || null;

    let messages = [];
    const candidates = [
      json?.messages,
      json?.Messages,
      json?.session?.messages,
      json?.session?.Messages,
      json?.data?.messages,
      json?.data?.Messages
    ].find(Array.isArray);

    if (Array.isArray(candidates)) {
      messages = candidates
        .map((item) => item?.Body || item?.body || item?.text || item?.message || null)
        .filter(Boolean); // Apenas filtra os vazios
    }

    const lastMessage = json?.lastMessage?.Body || json?.lastMessage?.body || json?.session?.lastMessage?.Body || json?.data?.lastMessage?.Body || messages[messages.length - 1] || '';
    if (!lastMessage && messages.length === 0) return { sessionId, protocol, clinicId, messages: [], lastMessage: '' };

    const normalized = [...messages, lastMessage].filter(Boolean);
    return {
      sessionId,
      protocol,
      clinicId,
      messages: normalized, // Manda tudo para o content.js filtrar!
      lastMessage: lastMessage || normalized[normalized.length - 1] || ''
    };
  }
})();
