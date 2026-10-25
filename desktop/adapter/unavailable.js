// The unavailable adapter, selected when Steam does not start: every capability reports unavailable,
// every call rejects with `unavailable` ("Steam unavailable"), and its events never fire.
import { ADAPTER_OPERATIONS, CAPABILITIES, HostError } from './interface.js';

export function createUnavailableAdapter() {
  const adapter = {
    kind: 'unavailable',
    capabilities: Object.freeze(Object.fromEntries(CAPABILITIES.map((capability) => [capability, false]))),
    shutdown: async () => {},
  };
  for (const ops of Object.values(ADAPTER_OPERATIONS)) {
    for (const op of ops) {
      adapter[op] = op.startsWith('on')
        ? () => () => {}
        : async () => { throw new HostError('unavailable'); };
    }
  }
  return Object.freeze(adapter);
}
