import manropeVariableFontBase64 from "base64!./fonts/Manrope/Manrope-VariableFont_wght.ttf";

/**
 * Manrope, bundled locally as a variable font so the editor's font doesn't
 * depend on network access (previously fetched from Google Fonts at
 * runtime). Covers weights 200-800 in a single embedded file.
 */
export const MANROPE_FONT_FACE_CSS = `
@font-face {
  font-family: 'Manrope';
  font-weight: 200 800;
  font-style: normal;
  src: url(data:font/truetype;base64,${manropeVariableFontBase64}) format('truetype');
}
`;

/**
 * Blanket override so drawio's own hardcoded UI fonts (menus, dialogs,
 * etc.) use Manrope regardless of specificity or load order.
 *
 * Note: `inherit` is a CSS-wide keyword and is NOT valid mixed into a
 * comma-separated font-family list (e.g. `'Manrope', inherit` is invalid
 * and gets the whole declaration dropped) - it has to be the entire
 * property value on its own. Use real fallback font names instead.
 */
export const MANROPE_UI_FONT_OVERRIDE_CSS = `
body, body * {
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, ui-sans-serif, Helvetica, Arial, sans-serif !important;
}
`;
