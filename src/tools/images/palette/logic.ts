/** Palette export formats. Pure string building, so every format is testable. */

/** One entry of the `extract_palette` backend response. */
export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  population: number;
  percentage: number;
}

export type ExportFormat = 'css' | 'tailwind' | 'json' | 'list';

export function rgbString(color: PaletteColor): string {
  return `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
}

export function percentLabel(color: PaletteColor): string {
  const value = color.percentage;
  if (value >= 10) return `${value.toFixed(0)}%`;
  if (value >= 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

/** Slug used as the variable / key name for the nth colour. */
export function tokenName(index: number, prefix = 'color'): string {
  return `${prefix}-${index + 1}`;
}

export function toCssVariables(colors: PaletteColor[], prefix = 'color'): string {
  const body = colors
    .map((c, i) => `  --${tokenName(i, prefix)}: ${c.hex.toLowerCase()}; /* ${percentLabel(c)} */`)
    .join('\n');
  return `:root {\n${body}\n}`;
}

export function toTailwind(colors: PaletteColor[], key = 'palette'): string {
  const entries = colors.map((c, i) => `          '${i + 1}': '${c.hex.toLowerCase()}',`);
  return [
    '// tailwind.config.js',
    'module.exports = {',
    '  theme: {',
    '    extend: {',
    '      colors: {',
    `        ${key}: {`,
    ...entries,
    '        },',
    '      },',
    '    },',
    '  },',
    '};',
  ].join('\n');
}

export function toJson(colors: PaletteColor[]): string {
  return JSON.stringify(
    colors.map((c, i) => ({
      name: tokenName(i),
      hex: c.hex.toLowerCase(),
      rgb: c.rgb,
      share: Number(c.percentage.toFixed(2)),
    })),
    null,
    2,
  );
}

export function toPlainList(colors: PaletteColor[]): string {
  return colors.map((c) => c.hex.toUpperCase()).join('\n');
}

export function allHex(colors: PaletteColor[]): string {
  return colors.map((c) => c.hex.toUpperCase()).join(', ');
}

export function exportPalette(colors: PaletteColor[], format: ExportFormat): string {
  switch (format) {
    case 'css':
      return toCssVariables(colors);
    case 'tailwind':
      return toTailwind(colors);
    case 'json':
      return toJson(colors);
    case 'list':
      return toPlainList(colors);
  }
}

export function exportExtension(format: ExportFormat): string {
  return format === 'css' ? 'css' : format === 'json' ? 'json' : format === 'tailwind' ? 'js' : 'txt';
}

/**
 * Swatch widths for the proportional band. Every colour keeps a visible sliver
 * even when it is a rounding error of the image.
 */
export function bandWidths(colors: PaletteColor[], minPercent = 3): number[] {
  if (colors.length === 0) return [];
  const raised = colors.map((c) => Math.max(c.percentage, minPercent));
  const total = raised.reduce((sum, n) => sum + n, 0);
  return raised.map((n) => (n / total) * 100);
}
