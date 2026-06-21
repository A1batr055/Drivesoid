'use strict';
const https  = require('https');
const config = require('./config').load();

const API_URL            = new URL(config.classifier.endpoint.replace(/\/$/, '') + '/chat/completions');
const API_KEY_ENV        = config.classifier.api_key_env;
const MODEL              = config.classifier.model || 'deepseek-v4-flash';
const REQUEST_TIMEOUT_MS = 15000;

const VALID_LABELS = new Set([
  'affectionate',
  'playful',
  'vulnerable',
  'reassuring',
  'cold',
  'conflict',
  'distant',
  'struggling',
  'intimate_reference',
  'intimate_event',
  'neutral',
  'hostile',
]);

const SYSTEM_PROMPT = `You are an emotion classifier. Analyze the conversation context and choose the single best label for the [CLASSIFY] message. Output JSON: {"label":"<label>","confidence":<0 to 1>}

Labels:
- affectionate: warm, loving, expressing care or affection
- playful: teasing, joking, playful banter (including mock threats)
- vulnerable: expressing vulnerability, insecurity, or emotional fragility
- reassuring: comforting, affirming, offering support
- cold: emotionally withdrawn, detached, terse without warmth (distinct from neutral's lack of tone)
- conflict: genuine mutual argument, emotional escalation, hurtful words exchanged both ways
- distant: distracted, disengaged, doesn't want to talk
- struggling: expressing stress, exhaustion, feeling unable to cope
- intimate_reference: referencing physical intimacy or the body
- intimate_event: actively engaged in an intimate interaction right now
- neutral: ordinary everyday response, no notable emotional tone, normal online presence ("ok", "sure", "got it")
- hostile: one-sided attack, mockery, or harsh words directed at the other person (distinct from conflict's mutual nature)

Rules:
- Output JSON only, no other content
- Classify only the [CLASSIFY] message; context is for reference only
- confidence reflects certainty; can be as low as 0.4 when unsure
- When the message is plain and unremarkable, use neutral`;

function createError(message, transient) {
  const error     = new Error(message);
  error.transient = transient;
  return error;
}

function parseResponseBody(body) {
  let response;
  try {
    response = JSON.parse(body);
  } catch {
    throw createError('Classifier response was not valid JSON', false);
  }

  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw createError('Classifier response did not include message content', false);
  }

  try {
    const cleaned = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw createError('Classifier output was not valid JSON', false);
  }
}

function validateClassification(result) {
  const { label, confidence } = result || {};

  if (!VALID_LABELS.has(label)) {
    throw createError(`Classifier returned invalid label: ${label}`, false);
  }

  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw createError(`Classifier returned invalid confidence: ${confidence}`, false);
  }

  return { label, confidence };
}

function buildUserMessage(text, context) {
  const personaName = config.persona.name;
  const userName    = config.user.name;
  const roleMap     = { user: userName, assistant: personaName };

  if (!context || context.length === 0) return `[CLASSIFY]\n${userName}: ${text}`;

  const lines = ['[CONTEXT]'];
  for (const m of context) {
    lines.push(`${roleMap[m.role] || m.role}: ${String(m.content)}`);
  }
  lines.push('[CLASSIFY]');
  lines.push(`${userName}: ${text}`);
  return lines.join('\n');
}

async function classifyMessage(text, context = []) {
  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    throw createError(`${API_KEY_ENV} is not set`, false);
  }

  const body = JSON.stringify({
    model:           MODEL,
    temperature:     0,
    max_tokens:      500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserMessage(text, context) },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: API_URL.protocol,
        hostname: API_URL.hostname,
        path:     API_URL.pathname,
        method:   'POST',
        headers:  {
          Authorization:   `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          if (statusCode !== 200) {
            reject(createError(`Classifier API returned HTTP ${statusCode}: ${responseBody}`, statusCode >= 500));
            return;
          }
          try {
            resolve(validateClassification(parseResponseBody(responseBody)));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(createError('Classifier API request timed out', true));
    });

    req.on('error', (e) => {
      if (typeof e.transient !== 'boolean') e.transient = true;
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { classifyMessage };
