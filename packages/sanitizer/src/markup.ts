// Step 2: markup remnants (sanitizer.md §Steps 2). Text and table parts only.

const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const STYLE = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;

/** Remove `<script>…</script>`, `<style>…</style>` and HTML comments. Other tags stay. */
export function stripMarkup(text: string): string {
  return text.replace(SCRIPT, "").replace(STYLE, "").replace(COMMENT, "");
}
