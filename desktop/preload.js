// The page bridge's preload. It runs in the sandboxed renderer as a plain script — no ES modules, and
// `require` reaches only Electron — so it reads the request and event lists from the main process
// (desktop/bridge.js, their one authority) and exposes one deeply frozen object to the page: a
// promise function per request, grouped as `<group>.<request>`, and under `events` a subscribe
// function per event, returning its unsubscribe. A request rejects with a typed error
// `{ code, message }` and never throws. Nothing is exposed when the main process offers no bridge.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const SPEC_CHANNEL = 'ms3d:bridge-spec';

(function exposeBridge() {
  const spec = ipcRenderer.sendSync(SPEC_CHANNEL);
  if (!spec || !Array.isArray(spec.requests) || !Array.isArray(spec.events)) return;

  const failed = () => ({ code: 'failed', message: 'Request failed' });

  const send = (operation) => (...args) => new Promise((resolve, reject) => {
    new Promise((ask) => { ask(ipcRenderer.invoke(spec.channels.request, operation, args)); }).then(
      (reply) => {
        if (reply && reply.ok === true) resolve(reply.value);
        else if (reply && reply.error && typeof reply.error.code === 'string') {
          reject({ code: reply.error.code, message: String(reply.error.message) });
        } else reject(failed());
      },
      () => reject(failed()),
    );
  });

  const listeners = new Map(spec.events.map((event) => [event, new Set()]));
  ipcRenderer.on(spec.channels.event, (_event, name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        setTimeout(() => { throw error; });
      }
    }
  });
  const subscribe = (event) => (listener) => {
    if (typeof listener !== 'function') return () => {};
    listeners.get(event).add(listener);
    return () => { listeners.get(event).delete(listener); };
  };

  const groups = {};
  for (const operation of spec.requests) {
    const [group, name] = operation.split('.');
    groups[group] = groups[group] || {};
    groups[group][name] = send(operation);
  }
  const api = {};
  for (const [group, requests] of Object.entries(groups)) api[group] = Object.freeze(requests);
  api.events = Object.freeze(Object.fromEntries(spec.events.map((event) => [event, subscribe(event)])));
  contextBridge.exposeInMainWorld(spec.global, Object.freeze(api));
}());
