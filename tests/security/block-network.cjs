// Review-only guard: no credentials or billable provider requests are used.
globalThis.fetch = async function reviewBlockedFetch() {
  const error = new Error('REVIEW_NETWORK_DISABLED');
  error.code = 'REVIEW_NETWORK_DISABLED';
  throw error;
};
for (const name of ['http', 'https']) {
  const transport = require('node:' + name);
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function(input, ...args) {
      const host = typeof input === 'string' || input instanceof URL
        ? new URL(input).hostname
        : (input.hostname || input.host || 'localhost');
      if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
        throw new Error('REVIEW_NETWORK_DISABLED');
      }
      return original.call(this, input, ...args);
    };
  }
}
