const TIME_CANDIDATES = [
  /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
  /property=["']article:modified_time["'][^>]*content=["']([^"']+)["']/i,
  /name=["']date["'][^>]*content=["']([^"']+)["']/i,
  /datetime=["']([^"']+)["']/i,
  /updated\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
];

export function extractSourcePublishedAt(html = '', text = ''): string | undefined {
  const source = `${html} ${text.slice(0, 2000)}`;

  for (const pattern of TIME_CANDIDATES) {
    const match = source.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const candidate = match[1].trim();
    const parsed = new Date(candidate);

    return Number.isNaN(parsed.getTime()) ? candidate : parsed.toISOString();
  }

  return undefined;
}
