export interface SqlToken { text: string; kind: 'keyword' | 'string' | 'comment' | 'number' | 'plain' }

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'ON', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
  'CROSS', 'JOIN', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'WITH', 'DISTINCT', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'UNION', 'ALL', 'ASC', 'DESC', 'CAST', 'OVER',
  'PARTITION', 'QUALIFY', 'EXCEPT', 'INTERVAL', 'TRUE', 'FALSE', 'USING',
]);

const TOKEN = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let last = 0;
  for (const match of sql.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ text: sql.slice(last, at), kind: 'plain' });
    const [text, comment, string, number, word] = match;
    const kind: SqlToken['kind'] = comment
      ? 'comment'
      : string
        ? 'string'
        : number
          ? 'number'
          : word && KEYWORDS.has(word.toUpperCase())
            ? 'keyword'
            : 'plain';
    tokens.push({ text, kind });
    last = at + text.length;
  }
  if (last < sql.length) tokens.push({ text: sql.slice(last), kind: 'plain' });
  return tokens;
}
