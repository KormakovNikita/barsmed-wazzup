const PLACEHOLDER_RE = /\{([^{}\s]+)\}/g;

export function extractTemplatePlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const key = match[1]?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function applyTemplatePlaceholders(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(PLACEHOLDER_RE, (_, key: string) => {
    const trimmed = key.trim();
    return values[trimmed]?.trim() ?? `{${trimmed}}`;
  });
}

export function templatePreviewLabel(title: string, body: string): string {
  const preview = body.replace(PLACEHOLDER_RE, "…").replace(/\s+/g, " ").trim();
  if (preview.length <= 60) return preview;
  return `${preview.slice(0, 57)}…`;
}
