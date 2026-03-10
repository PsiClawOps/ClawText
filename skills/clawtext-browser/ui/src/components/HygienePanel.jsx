/**
 * HygienePanel.jsx
 *
 * Memory hygiene — manage patterns that scrub sensitive data
 * before it ever hits the memory buffer.
 *
 * Three sections:
 * 1. Global toggle + stats overview
 * 2. Pattern list (builtins + custom) with enable/disable per pattern
 * 3. Test scratchpad — paste text, see what gets redacted
 * (4. Audit — scan existing memories for leaks)
 */

import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:3737/api/hygiene';

const SEVERITY_COLORS = {
  critical: '#f85149',
  high:     '#e3b341',
  medium:   '#58a6ff',
  low:      '#3fb950',
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function StatPill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 56 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#c9d1d9' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#8b949e' }}>{label}</div>
    </div>
  );
}

function PatternRow({ pattern, onToggle }) {
  const [toggling, setToggling] = useState(false);
  const color = SEVERITY_COLORS[pattern.severity] || '#6e7681';

  async function handleToggle() {
    setToggling(true);
    await fetch(`${API}/patterns/${pattern.id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !pattern.enabled }),
    });
    setToggling(false);
    onToggle();
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      padding: '0.6rem 0.75rem',
      borderRadius: 6,
      background: pattern.enabled ? 'transparent' : '#0d1117',
      opacity: pattern.enabled ? 1 : 0.55,
      transition: 'all 0.15s',
      borderBottom: '1px solid #21262d',
    }}>
      {/* Enabled toggle */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        title={pattern.enabled ? 'Disable' : 'Enable'}
        style={{
          width: 28, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
          background: pattern.enabled ? '#238636' : '#30363d',
          flexShrink: 0, marginTop: 3, transition: 'background 0.15s',
          position: 'relative',
        }}
      >
        <div style={{
          width: 10, height: 10, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3,
          left: pattern.enabled ? 15 : 3,
          transition: 'left 0.15s',
        }} />
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 500 }}>{pattern.name}</span>
          <span style={{ fontSize: 11, color: color, background: `${color}1a`, padding: '1px 6px', borderRadius: 4 }}>
            {pattern.severity}
          </span>
          {pattern.builtin && (
            <span style={{ fontSize: 10, color: '#8b949e', background: '#8b949e1a', padding: '1px 5px', borderRadius: 4 }}>
              builtin
            </span>
          )}
        </div>
        <code style={{ fontSize: 11, color: '#8b949e', display: 'block', marginTop: 2, wordBreak: 'break-all' }}>
          /{pattern.regex}/{pattern.flags}  →  {pattern.replacement}
        </code>
        {pattern.example && (
          <div style={{ fontSize: 11, color: '#6e7681', marginTop: 1 }}>
            e.g. <code style={{ color: '#8b949e' }}>{pattern.example}</code>
          </div>
        )}
        {pattern.warn && (
          <div style={{ fontSize: 11, color: '#e3b341', marginTop: 2 }}>
            ⚠️ {pattern.warn}
          </div>
        )}
      </div>

      {/* Delete (custom only) */}
      {!pattern.builtin && (
        <button
          onClick={async () => {
            await fetch(`${API}/patterns/${pattern.id}`, { method: 'DELETE' });
            onToggle();
          }}
          title="Delete pattern"
          style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function TestScratchpad() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      setResult(await resp.json());
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  const hasFindings = result?.redactions?.length > 0;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ color: '#8b949e', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        🧪 Test Scratchpad
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setResult(null); }}
        placeholder={'Paste text here to test sanitization...\n\nExample:\n  MY_API_KEY=sk-abc123abcdef...\n  Authorization: Bearer eyJhbGci...'}
        rows={6}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
          color: '#c9d1d9', padding: '0.5rem', fontSize: 13, resize: 'vertical',
          fontFamily: 'monospace',
        }}
      />
      <button
        onClick={handleTest}
        disabled={loading || !text.trim()}
        style={{
          marginTop: 6, background: '#1f6feb', color: '#fff',
          border: 'none', borderRadius: 6, padding: '6px 16px',
          cursor: loading ? 'wait' : 'pointer', fontSize: 13,
          opacity: !text.trim() ? 0.5 : 1,
        }}
      >
        {loading ? 'Testing...' : '🔍 Test Sanitization'}
      </button>

      {result && !result.error && (
        <div style={{ marginTop: '0.75rem' }}>
          {/* Status */}
          <div style={{
            padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '0.5rem',
            background: hasFindings ? '#f851491a' : '#3fb9501a',
            border: `1px solid ${hasFindings ? '#f8514933' : '#3fb95033'}`,
            color: hasFindings ? '#f85149' : '#3fb950',
            fontSize: 13,
          }}>
            {hasFindings
              ? `⚠️ ${result.redactions.reduce((s, r) => s + r.count, 0)} sensitive values found and redacted across ${result.redactions.length} pattern(s)`
              : '✅ No sensitive data detected'}
          </div>

          {/* Redactions list */}
          {result.redactions.map(r => (
            <div key={r.patternId} style={{ fontSize: 12, color: '#e3b341', marginBottom: 2 }}>
              • <strong>{r.patternName}</strong>: {r.count} match{r.count !== 1 ? 'es' : ''} → {r.replacement || '[redacted]'}
            </div>
          ))}

          {/* Sanitized output */}
          {hasFindings && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ color: '#8b949e', fontSize: 11, marginBottom: 4 }}>Sanitized output:</div>
              <pre style={{
                background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
                padding: '0.5rem', fontSize: 12, color: '#c9d1d9',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto',
              }}>
                {result.sanitized}
              </pre>
            </div>
          )}
        </div>
      )}

      {result?.error && (
        <div style={{ marginTop: '0.5rem', color: '#f85149', fontSize: 13 }}>{result.error}</div>
      )}
    </div>
  );
}

function AddPatternForm({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', regex: '', flags: 'g', replacement: '[REDACTED:custom]', severity: 'medium' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`${API}/patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      setOpen(false);
      setForm({ name: '', regex: '', flags: 'g', replacement: '[REDACTED:custom]', severity: 'medium' });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent', color: '#58a6ff',
          border: '1px dashed #30363d', borderRadius: 6,
          padding: '6px 14px', cursor: 'pointer', fontSize: 13,
          width: '100%', marginTop: '0.5rem',
        }}
      >
        + Add Custom Pattern
      </button>
    );
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    color: '#c9d1d9', padding: '5px 8px', fontSize: 13,
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '0.75rem', background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '1rem' }}>
      <div style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: '0.75rem' }}>Add Custom Pattern</div>
      {[
        { key: 'name', label: 'Name', placeholder: 'e.g. My Service API Key' },
        { key: 'regex', label: 'Regex', placeholder: 'e.g. myservice-[a-zA-Z0-9]{32}', mono: true },
        { key: 'replacement', label: 'Replacement', placeholder: '[REDACTED:my-service-key]', mono: true },
      ].map(({ key, label, placeholder, mono }) => (
        <div key={key} style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: 11, color: '#8b949e', marginBottom: 3 }}>{label}</label>
          <input
            value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder} required
            style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'inherit' }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#8b949e', marginBottom: 3 }}>Flags</label>
          <input value={form.flags} onChange={e => setForm(f => ({ ...f, flags: e.target.value }))}
            style={{ ...inputStyle, fontFamily: 'monospace' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#8b949e', marginBottom: 3 }}>Severity</label>
          <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
            style={{ ...inputStyle }}>
            {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: '0.5rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}
          style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
          {saving ? 'Saving...' : 'Save Pattern'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function HygienePanel() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | critical | high | medium | custom
  const [auditResult, setAuditResult] = useState(null);
  const [auditing, setAuditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/patterns`),
        fetch(`${API}/stats`),
      ]);
      setData(await pRes.json());
      setStats(await sRes.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function runAudit() {
    setAuditing(true);
    setAuditResult(null);
    try {
      const resp = await fetch(`${API}/audit-memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 388 }) });
      setAuditResult(await resp.json());
    } catch (err) {
      setAuditResult({ error: err.message });
    } finally {
      setAuditing(false);
    }
  }

  const filteredPatterns = (data?.patterns || [])
    .filter(p => {
      if (filter === 'all') return true;
      if (filter === 'custom') return !p.builtin;
      return p.severity === filter;
    })
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, color: '#c9d1d9', fontSize: 16 }}>🧹 Memory Hygiene</h2>
          {data && (
            <button
              onClick={async () => {
                await fetch(`${API}/global`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ enabled: !data.enabled }),
                });
                load();
              }}
              style={{
                background: data.enabled ? '#238636' : '#30363d',
                color: '#fff', border: 'none', borderRadius: 6,
                padding: '4px 12px', cursor: 'pointer', fontSize: 12,
              }}
            >
              {data.enabled ? '✅ Sanitization ON' : '⛔ Sanitization OFF'}
            </button>
          )}
        </div>

        {/* Stats row */}
        {stats && (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', background: '#161b22', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
            <StatPill label="Total" value={stats.total} />
            <StatPill label="Active" value={stats.active} color="#3fb950" />
            <StatPill label="Disabled" value={stats.disabled} color="#6e7681" />
            <StatPill label="Critical" value={stats.bySeverity.critical} color={SEVERITY_COLORS.critical} />
            <StatPill label="High" value={stats.bySeverity.high} color={SEVERITY_COLORS.high} />
            <StatPill label="Medium" value={stats.bySeverity.medium} color={SEVERITY_COLORS.medium} />
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'critical', 'high', 'medium', 'custom'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? '#21262d' : 'transparent',
              color: filter === f ? (SEVERITY_COLORS[f] || '#c9d1d9') : '#8b949e',
              border: filter === f ? '1px solid #30363d' : '1px solid transparent',
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12,
            }}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0.75rem 1rem' }}>
        {loading && <div style={{ color: '#6e7681', textAlign: 'center', padding: '2rem' }}>Loading...</div>}

        {/* Pattern list */}
        {!loading && (
          <div style={{ background: '#161b22', borderRadius: 8, border: '1px solid #30363d', marginBottom: '1rem', overflow: 'hidden' }}>
            {filteredPatterns.length === 0 && (
              <div style={{ padding: '1rem', color: '#6e7681', fontSize: 13, textAlign: 'center' }}>No patterns in this category.</div>
            )}
            {filteredPatterns.map(p => (
              <PatternRow key={p.id} pattern={p} onToggle={load} />
            ))}
          </div>
        )}

        {/* Add custom */}
        <AddPatternForm onAdded={load} />

        {/* Test scratchpad */}
        <TestScratchpad />

        {/* Memory audit */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #21262d', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <div style={{ color: '#8b949e', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              🔎 Scan Existing Memories for Leaks
            </div>
            <button onClick={runAudit} disabled={auditing} style={{
              background: '#6e768122', color: '#c9d1d9', border: '1px solid #30363d',
              borderRadius: 6, padding: '4px 12px', cursor: auditing ? 'wait' : 'pointer', fontSize: 12,
            }}>
              {auditing ? 'Scanning...' : 'Run Audit'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#6e7681', marginBottom: '0.5rem' }}>
            Scans all 388 loaded memories for pattern matches. Does not modify anything — read-only scan.
          </div>

          {auditResult && !auditResult.error && (
            <div style={{
              background: auditResult.findingsCount > 0 ? '#f851491a' : '#3fb9501a',
              border: `1px solid ${auditResult.findingsCount > 0 ? '#f8514933' : '#3fb95033'}`,
              borderRadius: 6, padding: '0.75rem',
            }}>
              <div style={{ color: auditResult.findingsCount > 0 ? '#f85149' : '#3fb950', fontSize: 13, marginBottom: '0.5rem' }}>
                {auditResult.findingsCount > 0
                  ? `⚠️ Found ${auditResult.findingsCount} memories with potential sensitive data (out of ${auditResult.scanned} scanned)`
                  : `✅ No sensitive data found in ${auditResult.scanned} memories`}
              </div>
              {auditResult.findings.slice(0, 10).map(f => (
                <div key={f.memoryId} style={{ marginBottom: '0.5rem', background: '#0d1117', borderRadius: 6, padding: '0.5rem', fontSize: 12 }}>
                  <div style={{ color: '#c9d1d9' }}>[{f.clusterTopic}] {f.matchCount} match{f.matchCount !== 1 ? 'es' : ''}</div>
                  {f.matches.map((m, i) => (
                    <div key={i} style={{ color: '#8b949e', marginTop: 2 }}>
                      <span style={{ color: SEVERITY_COLORS[m.severity] }}>{m.patternId}</span>: <code>{m.snippet}</code>
                    </div>
                  ))}
                </div>
              ))}
              {auditResult.findings.length > 10 && (
                <div style={{ color: '#8b949e', fontSize: 12 }}>+{auditResult.findings.length - 10} more…</div>
              )}
            </div>
          )}

          {auditResult?.error && (
            <div style={{ color: '#f85149', fontSize: 13 }}>{auditResult.error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
