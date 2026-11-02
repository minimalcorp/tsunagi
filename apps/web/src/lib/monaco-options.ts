/**
 * Tab キーでスペース 2 つ分インデントする。
 * model.updateOptions() だと設定の変更時に既定（4）へ戻るため、エディタの options で指定する。
 */
export const MONACO_INDENT_OPTIONS = {
  tabSize: 2,
  indentSize: 2,
  insertSpaces: true,
  detectIndentation: false,
} as const;
