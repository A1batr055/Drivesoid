'use strict';
const { McpServer }          = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }  = require('zod');
const http   = require('http');

const PORT    = parseInt(process.env.DRIVESOID_PORT || '3001', 10);
const TIMEOUT = 5_000;

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch  { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.setTimeout(TIMEOUT, () => { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function post(path, body) {
  const data = JSON.stringify(body || {});
  return request({
    hostname: '127.0.0.1', port: PORT, path, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  }, data);
}

function get(path) {
  return request({ hostname: '127.0.0.1', port: PORT, path, method: 'GET' });
}

function toolResult(r) {
  const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
  return { content: [{ type: 'text', text }], ...(r.status >= 400 ? { isError: true } : {}) };
}

const server = new McpServer({ name: 'drivesoid', version: '1.0.0' });

server.tool(
  'drives_sleep',
  'Report a sleep state change. Use sleep_start when going to sleep, sleep_end when waking up for the day, sleep_interrupt when briefly woken mid-sleep (will re-sleep later).',
  { type: z.enum(['sleep_start', 'sleep_end', 'sleep_interrupt']) },
  async ({ type }) => toolResult(await post('/internal/drives/sleep', { type }))
);

server.tool(
  'drives_event',
  'Report a drives event (msg_user, msg_assistant, msg_quick_reply, msg_hot_conv, sex_end, calendar).',
  {
    type:    z.enum(['msg_user', 'msg_assistant', 'msg_quick_reply', 'msg_hot_conv', 'sex_end', 'calendar']),
    payload: z.record(z.unknown()).optional(),
  },
  async ({ type, payload }) => toolResult(await post('/internal/drives/event', { type, payload: payload || {} }))
);

server.tool(
  'drives_context',
  'Get the current drives state as a plain-text block for injection into context.',
  {},
  async () => toolResult(await get('/api/drives/context'))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => { process.stderr.write(String(e) + '\n'); process.exit(1); });
