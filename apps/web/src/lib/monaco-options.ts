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

/**
 * EditContext API（monaco 0.55 の既定）を使わず、従来の textarea で入力を受ける。
 * EditContext だと日本語 IME の予測候補（Tab）で左右キーが候補移動に使われないため。
 */
export const MONACO_IME_OPTIONS = {
  editContext: false,
} as const;
