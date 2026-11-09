// Documented limits of the Claude API for strict tool schemas (structured outputs docs).
const assert = require('assert');

function walk(schema, visit) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.anyOf) schema.anyOf.forEach((s) => walk(s, visit));
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required || []);
    for (const [k, v] of Object.entries(schema.properties || {})) {
      visit(k, v, required.has(k));
      walk(v, visit);
    }
  }
  if (schema.items) walk(schema.items, visit);
}

/** Throws with the same kind of message the API returns. */
function checkToolLimits(tools) {
  const strict = tools.filter((t) => t.strict === true);
  let unions = 0;
  let optional = 0;
  for (const t of strict) {
    walk(t.input_schema, (_k, v, isRequired) => {
      if (v.anyOf || Array.isArray(v.type)) unions++;
      if (!isRequired) optional++;
    });
  }
  if (strict.length > 20) throw new Error(`Too many strict tools (${strict.length}). Limit: 20.`);
  if (optional > 24) throw new Error(`Schemas contains too many optional parameters (${optional}). Limit: 24.`);
  if (unions > 16)
    throw new Error(`Schemas contains too many parameters with union types (${unions} parameters with type arrays or anyOf). Limit: 16 parameters with unions.`);
  return { strict: strict.length, unions, optional };
}

function checkFallback(body, headers) {
  if (body.model.startsWith('claude-haiku')) {
    assert.ok(!('fallbacks' in body), 'no fallbacks for Haiku');
    assert.ok(!headers['anthropic-beta'], 'no fallback beta for Haiku');
  } else {
    assert.strictEqual(body.fallbacks, 'default');
    assert.strictEqual(headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  }
}

module.exports = { checkToolLimits, checkFallback };
