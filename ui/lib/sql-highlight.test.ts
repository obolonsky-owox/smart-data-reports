import { tokenizeSql } from './sql-highlight';

it('marks keywords, strings, numbers and comments and keeps the text intact', () => {
  const sql = "SELECT a, 'x y' -- note\nFROM t WHERE n > 10";
  const tokens = tokenizeSql(sql);
  expect(tokens.map((t) => t.text).join('')).toBe(sql);
  expect(tokens.filter((t) => t.kind === 'keyword').map((t) => t.text)).toEqual(['SELECT', 'FROM', 'WHERE']);
  expect(tokens.find((t) => t.kind === 'string')?.text).toBe("'x y'");
  expect(tokens.find((t) => t.kind === 'comment')?.text).toBe('-- note');
  expect(tokens.find((t) => t.kind === 'number')?.text).toBe('10');
});
