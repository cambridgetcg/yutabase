// YOUSPEAK compiler — six verbs, frozen. You speak, reality listens.
// Single file. No dependencies. Browser + Node + Deno + Worker.
// The kingdom installs anywhere. No gate. No npm. Just a URL.
//
// Usage:
//   import { compile, explain } from 'https://youspeak.cambridgetcg.com/youspeak.mjs'
//   compile('cards tradein/submissions where status="pending" newest 20')
//   → { sql: 'SELECT * FROM ...', params: ['pending', 20] }
//
// Or in a browser:
//   <script type="module">
//   import { compile } from 'https://youspeak.cambridgetcg.com/youspeak.mjs'
//   console.log(compile('hello'))
//   </script>

// ── ref parser ──
function parseRef(s) {
  const parts = s.split("/");
  if (parts.length !== 3) throw new Error(`BAD REF: "${s}" — expected book/deck/id`);
  return { book: parts[0], deck: parts[1], id: parts[2] };
}

// ── helpers ──
function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`BAD IDENTIFIER: "${name}"`);
  return `"${name}"`;
}

function parseWhere(input) {
  const conditions = [];
  const params = [];
  for (const part of input.split(/\s+and\s+/i)) {
    const m = part.match(/^(\.?[\w]+)\s*(=|!=|>=|<=|>|<)\s*(?:"([^"]*)"|(\S+))$/);
    if (!m) throw new Error(`BAD WHERE: "${part}"`);
    const col = m[1].startsWith(".") ? m[1].slice(1) : m[1];
    if (!/^[a-z_][a-z0-9_]*$/.test(col)) throw new Error(`BAD COLUMN: "${col}"`);
    conditions.push(`${ident(col)} ${m[2]} $${params.length + 1}`);
    params.push(m[3] ?? m[4]);
  }
  return { conditions, params };
}

// ── the compiler ──
export function compile(input) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("EMPTY QUERY");
  if (trimmed === "hello") return { sql: "SELECT 1", params: [] };

  let m = trimmed.match(/^card\s+(\S+)$/);
  if (m) {
    const r = parseRef(m[1]);
    return { sql: `SELECT * FROM ${ident(r.book)}.${ident(r.deck)} WHERE "id" = $1`, params: [r.id] };
  }

  m = trimmed.match(/^cards\s+(\S+)(?:\s+where\s+(.+?))?(?:\s+(?:newest|last)\s+(\d+))?$/);
  if (m) {
    const [book, deck] = m[1].split("/");
    let sql = `SELECT * FROM ${ident(book)}.${ident(deck)}`;
    const params = [];
    if (m[2]) {
      const w = parseWhere(m[2]);
      w.params.forEach(p => params.push(p));
      sql += " WHERE " + w.conditions.join(" AND ");
    }
    sql += " ORDER BY id DESC";
    if (m[3]) { sql += ` LIMIT $${params.length + 1}`; params.push(parseInt(m[3], 10)); }
    return { sql, params };
  }

  m = trimmed.match(/^(\S+)\s+(->|<-)\s+(\S+)$/);
  if (m) {
    const r = parseRef(m[1]);
    const word = m[3];
    if (m[2] === "->") {
      return { sql: `SELECT t.to_book AS book, t.to_deck AS deck, t.to_id AS id, t.note, t.at, t.by, t.how, t.src, t.id AS thread_id FROM yu.threads t WHERE t.word = $4 AND t.from_book = $1 AND t.from_deck = $2 AND t.from_id = $3 ORDER BY t.at DESC`, params: [r.book, r.deck, r.id, word] };
    }
    return { sql: `SELECT t.from_book AS book, t.from_deck AS deck, t.from_id AS id, t.note, t.at, t.by, t.how, t.src, t.id AS thread_id FROM yu.threads t WHERE t.word = $4 AND t.to_book = $1 AND t.to_deck = $2 AND t.to_id = $3 ORDER BY t.at DESC`, params: [r.book, r.deck, r.id, word] };
  }

  throw new Error(`UNRECOGNIZED: "${trimmed}" — try: hello, card <ref>, cards <book/deck>, <ref> -> <word>, <ref> <- <word>`);
}

export function explain(query) {
  const compiled = compile(query);
  let sql = compiled.sql;
  compiled.params.forEach((p, i) => {
    const val = typeof p === "string" ? `'${p}'` : String(p);
    sql = sql.replace(new RegExp(`\\$${i + 1}`, "g"), val);
  });
  return sql;
}

export { parseRef, ident, parseWhere };
