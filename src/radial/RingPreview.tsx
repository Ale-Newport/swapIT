import { useEffect, useState } from 'react';
import { RING } from './geometry';
import { Ring } from './Ring';
import type { RadialItem } from './model';
import './glass.css';

const SAMPLE: RadialItem[] = [
  ['JPG', 'JPEG', 'Convert to JPEG'],
  ['PNG', 'Lossless', 'Convert to PNG'],
  ['WEBP', 'Web', 'Convert to WebP'],
  ['MIN', 'Compress', 'Compress the image'],
  ['50%', 'Resize', 'Make it smaller'],
  ['···', 'More', 'More things to do'],
].map(([glyph, label, title], i) => ({
  id: `preview-${i}`,
  glyph,
  label,
  title,
  icon: 'Box',
  hint: 'One click, saved next to the original',
  mode: 'task' as const,
  run: async () => undefined,
}));

/**
 * A live, non-interactive ring for the settings page. The real overlay gets its blur from
 * macOS; here a masked `backdrop-filter` stands in so appearance changes are visible instantly.
 */
export function RingPreview({
  theme,
  accent,
  opacity,
  scale = 0.9,
}: {
  theme: 'light' | 'dark';
  accent: string;
  opacity: number;
  scale?: number;
}) {
  const [hover, setHover] = useState<number | null>(1);

  useEffect(() => {
    const id = window.setInterval(() => setHover((h) => ((h ?? -1) + 1) % SAMPLE.length), 1500);
    return () => window.clearInterval(id);
  }, []);

  const stops = `#000 0 ${RING.core}px, transparent ${RING.core + 0.8}px ${RING.inner - 0.8}px, #000 ${RING.inner}px ${RING.outer}px, transparent ${RING.outer + 0.8}px`;
  const mask = `radial-gradient(circle at 50% 50%, ${stops})`;
  const dark = theme === 'dark';

  return (
    <div className="rp-wall" data-dark={dark} aria-hidden="true">
      <div className="rp-stage" style={{ zoom: scale }}>
        <i
          className="rp-blur"
          style={{ WebkitMaskImage: mask, maskImage: mask }}
          data-dark={dark}
        />
        <div
          className="rg-root"
          data-embedded="true"
          data-theme={theme}
          style={{ ['--rg-accent' as string]: accent, ['--rg-tint' as string]: opacity }}
        >
          <Ring
            items={SAMPLE}
            hover={hover}
            pressed={false}
            closing={false}
            dragging={false}
            showKeys={false}
            menuKey="preview"
            onPoint={() => undefined}
            onPress={() => undefined}
            onSelect={() => undefined}
            onCoreClick={() => undefined}
            onDismiss={() => undefined}
          >
            <div className="rg-core-eyebrow">&nbsp;</div>
            <div className="rg-core-visual" style={{ background: 'transparent' }}>
              <span className="rg-glyph">{SAMPLE[hover ?? 0].glyph}</span>
            </div>
            <div className="rg-core-title">{SAMPLE[hover ?? 0].title}</div>
            <div className="rg-core-sub">{SAMPLE[hover ?? 0].hint}</div>
          </Ring>
        </div>
      </div>
    </div>
  );
}
