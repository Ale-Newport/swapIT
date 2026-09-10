import { open } from '@tauri-apps/plugin-dialog';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { PDFDocument } from 'pdf-lib';
import { useEffect, useMemo, useRef, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { basename, dirname, formatBytes, shortenPath } from '@/core/format';
import { canvasToBytes, readBytes, saveAs, saveTextAs } from '@/core/save';
import type { FileResult } from '@/core/types';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  ColorInput,
  CopyButton,
  Field,
  Icon,
  Input,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  CONTENT_TYPES,
  DEFAULT_STYLE,
  EMPTY_FORM,
  buildMatrix,
  buildQrSvg,
  contrastRatio,
  payloadFor,
  relativeLuminance,
  suggestedName,
  type ErrorCorrection,
  type EyeShape,
  type GradientDirection,
  type ModuleShape,
  type QrContentType,
  type QrFormState,
  type QrStyle,
  type WifiEncryption,
} from './logic';
import {
  bytesToDataUrl,
  drawQr,
  loadImage,
  mimeForExtension,
  verifyCanvas,
  type VerifyResult,
} from './render';

interface Logo {
  name: string;
  dataUrl: string;
  element: HTMLImageElement;
}

const EXPORT_SIZES = [256, 512, 1024, 2048];

/** The PDF page is a fixed 4 × 4 in square (72 points to the inch). */
const PDF_PAGE_INCHES = 4;
const PDF_PAGE_POINTS = 72 * PDF_PAGE_INCHES;

const EC_HINTS: Record<ErrorCorrection, string> = {
  L: 'Recovers ~7% — smallest code, no logo',
  M: 'Recovers ~15% — the usual choice',
  Q: 'Recovers ~25% — good with a small logo',
  H: 'Recovers ~30% — needed for large logos',
};

export default function QrCodeGenerator() {
  const [type, setType] = useState<QrContentType>('url');
  const [form, setForm] = useState<QrFormState>(EMPTY_FORM);
  const [style, setStyle] = useState<QrStyle>(DEFAULT_STYLE);
  const [moduleSize, setModuleSize] = useState(8);
  const [exportSize, setExportSize] = useState(1024);
  const [logo, setLogo] = useState<Logo | null>(null);
  const [logoRatio, setLogoRatio] = useState(0.2);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerifyResult | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const set = <K extends keyof QrFormState>(key: K, value: QrFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const styleSet = (patch: Partial<QrStyle>) => setStyle((current) => ({ ...current, ...patch }));

  const { payload, contentError } = useMemo(() => {
    try {
      return { payload: payloadFor(type, form), contentError: null as string | null };
    } catch (err) {
      return { payload: null, contentError: err instanceof Error ? err.message : String(err) };
    }
  }, [type, form]);

  const { bits, matrixError } = useMemo(() => {
    if (!payload) return { bits: null, matrixError: null as string | null };
    try {
      return { bits: buildMatrix(payload, style.errorCorrection), matrixError: null as string | null };
    } catch (err) {
      return { bits: null, matrixError: err instanceof Error ? err.message : String(err) };
    }
  }, [payload, style.errorCorrection]);

  const logoSpec = useMemo(
    () => (logo ? { element: logo.element as CanvasImageSource, ratio: logoRatio } : null),
    [logo, logoRatio],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bits) {
      setVerification(null);
      return;
    }
    try {
      drawQr(canvas, { bits, style, cell: moduleSize, logo: logoSpec });
      setDrawError(null);
      setVerification(verifyCanvas(canvas, style.transparentBackground ? '#ffffff' : style.background));
    } catch (err) {
      setDrawError(err instanceof Error ? err.message : String(err));
      setVerification(null);
    }
  }, [bits, style, moduleSize, logoSpec]);

  useEffect(() => {
    setSaved(null);
    setExportError(null);
    setCopied(false);
  }, [payload, style, logo, logoRatio]);

  const contrast = contrastRatio(style.foreground, style.background);
  const fgLuminance = relativeLuminance(style.foreground);
  const bgLuminance = relativeLuminance(style.background);
  const inverted =
    fgLuminance !== null && bgLuminance !== null && !style.transparentBackground && fgLuminance > bgLuminance;

  const scanAdvice = (): string => {
    if (logo && logoRatio > 0.22) {
      return 'The logo is covering too much of the code. Drag it below 20%, or raise error correction to H.';
    }
    if (logo && style.errorCorrection !== 'H') {
      return 'The logo is hiding modules the decoder needs. Raise error correction to H, or make the logo smaller.';
    }
    if (contrast !== null && contrast < 3) {
      return `The two colours only differ by ${contrast.toFixed(1)}:1. Scanners need a dark code on a light background — aim for 7:1 or more.`;
    }
    if (style.margin < 4) {
      return 'The quiet zone is too narrow. Give the code a margin of at least 4 modules.';
    }
    if (inverted) {
      return 'This code is light on dark. Many scanners refuse inverted codes — swap the two colours.';
    }
    return 'A decoder could not read the rendered image. Raise the error correction level, widen the quiet zone, or use a darker foreground on a lighter background.';
  };

  const buildExportCanvas = (target: number): HTMLCanvasElement => {
    if (!bits) throw new Error('There is nothing to export yet — fill in the content first.');
    const canvas = document.createElement('canvas');
    const total = bits.length + style.margin * 2;
    // An integer module size keeps the edges crisp; the code is then centred in
    // the exact pixel size the user asked for.
    const cell = Math.max(1, Math.floor(target / total));
    drawQr(canvas, { bits, style, cell, canvasSize: Math.max(target, cell * total), logo: logoSpec });
    return canvas;
  };

  const runExport = async (label: string, task: () => Promise<FileResult | null>) => {
    setBusy(label);
    setExportError(null);
    setSaved(null);
    try {
      const result = await task();
      if (result) setSaved(result);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const savePng = () =>
    void runExport('png', async () => {
      const bytes = await canvasToBytes(buildExportCanvas(exportSize));
      return saveAs(bytes, `${suggestedName(type)}.png`);
    });

  const saveSvg = () =>
    void runExport('svg', async () => {
      if (!bits) throw new Error('There is nothing to export yet — fill in the content first.');
      const svg = buildQrSvg(bits, style, {
        pixelSize: exportSize,
        logo: logo ? { href: logo.dataUrl, ratio: logoRatio } : null,
      });
      return saveTextAs(svg, `${suggestedName(type)}.svg`);
    });

  const savePdf = () =>
    void runExport('pdf', async () => {
      const bytes = await canvasToBytes(buildExportCanvas(exportSize));
      const pdf = await PDFDocument.create();
      const image = await pdf.embedPng(bytes);
      // A PDF page is measured in points, not pixels. The image size the user
      // picked is the print resolution, so it fills a fixed physical square
      // instead of stretching the page to 2048 pt (28 in) across.
      const page = pdf.addPage([PDF_PAGE_POINTS, PDF_PAGE_POINTS]);
      page.drawImage(image, { x: 0, y: 0, width: PDF_PAGE_POINTS, height: PDF_PAGE_POINTS });
      return saveAs(await pdf.save(), `${suggestedName(type)}.pdf`);
    });

  const copyImage = () =>
    void runExport('copy', async () => {
      const bytes = await canvasToBytes(buildExportCanvas(exportSize));
      await writeImage(bytes);
      setCopied(true);
      return null;
    });

  const pickLogo = async () => {
    setLogoError(null);
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
      });
      if (typeof picked !== 'string') return;
      const bytes = await readBytes(picked);
      const extension = picked.split('.').pop() ?? 'png';
      const dataUrl = bytesToDataUrl(bytes, mimeForExtension(extension));
      const element = await loadImage(dataUrl);
      setLogo({ name: basename(picked), dataUrl, element });
      if (style.errorCorrection !== 'H') styleSet({ errorCorrection: 'H' });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Content" description="Pick what the code should do, then fill in the details.">
            <div className="space-y-4">
              <PresetRow
                presets={CONTENT_TYPES.map((t) => ({ label: t.label, value: t.value, hint: t.blurb }))}
                active={type}
                onSelect={(value) => setType(value)}
              />
              <ContentFields type={type} form={form} set={set} />
            </div>
          </Section>

          <Section
            title="Preview"
            description={payload ? `${payload.length} characters encoded` : 'Fill in the content to see the code'}
            actions={payload ? <CopyButton value={payload} label="Copy content" /> : undefined}
          >
            {!bits ? (
              <Alert
                tone={contentError ? 'info' : 'warn'}
                title={contentError ? 'Almost there' : 'This code cannot be built'}
              >
                {contentError ?? matrixError}
              </Alert>
            ) : (
              // The canvas stays mounted while there is a matrix, so a drawing
              // failure can clear itself on the next attempt.
              <div className="space-y-3">
                {drawError && <Alert tone="danger">{drawError}</Alert>}
                <div className="checkerboard flex items-center justify-center overflow-auto rounded-lg border border-line p-4">
                  <canvas ref={canvasRef} className="max-w-full" />
                </div>

                {verification && (
                  <div className="space-y-2">
                    {verification.ok ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="success">
                          <Icon name="CircleCheck" size={12} /> Scannable
                        </Badge>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-faint selectable">
                          {verification.decoded}
                        </span>
                      </div>
                    ) : (
                      <Alert tone="danger" title="Not scannable">
                        {scanAdvice()}
                      </Alert>
                    )}
                    {verification.ok && verification.decoded !== payload && (
                      <Alert tone="warn" title="The decoder read something different">
                        The image decodes, but not to the content you entered. Simplify the styling and try again.
                      </Alert>
                    )}
                    {verification.ok && inverted && (
                      <Alert tone="warn" title="Light on dark">
                        This code scans here, but older scanners often refuse inverted codes. Swapping the two
                        colours is the safe choice.
                      </Alert>
                    )}
                    {verification.ok && contrast !== null && contrast < 4.5 && !inverted && (
                      <Alert tone="warn" title="Low contrast">
                        The foreground and background differ by only {contrast.toFixed(1)}:1. It reads on screen,
                        but printing or dim light will make it unreliable.
                      </Alert>
                    )}
                  </div>
                )}

                <pre className="selectable max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11.5px] leading-[1.55] text-ink-soft">
                  {payload}
                </pre>
              </div>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Design">
            <div className="space-y-3">
              <Field label="Error correction" hint={EC_HINTS[style.errorCorrection]}>
                <Segmented
                  value={style.errorCorrection}
                  onChange={(value: ErrorCorrection) => styleSet({ errorCorrection: value })}
                  options={[
                    { value: 'L', label: 'L' },
                    { value: 'M', label: 'M' },
                    { value: 'Q', label: 'Q' },
                    { value: 'H', label: 'H' },
                  ]}
                  className="w-full"
                />
              </Field>

              <OptionsGrid>
                <Field label="Module shape">
                  <Select
                    value={style.moduleShape}
                    onChange={(e) => styleSet({ moduleShape: e.target.value as ModuleShape })}
                    options={[
                      { value: 'square', label: 'Square' },
                      { value: 'rounded', label: 'Rounded' },
                      { value: 'dots', label: 'Dots' },
                    ]}
                  />
                </Field>
                <Field label="Corner eyes">
                  <Select
                    value={style.eyeShape}
                    onChange={(e) => styleSet({ eyeShape: e.target.value as EyeShape })}
                    options={[
                      { value: 'square', label: 'Square' },
                      { value: 'rounded', label: 'Rounded' },
                      { value: 'circle', label: 'Circle' },
                    ]}
                  />
                </Field>
              </OptionsGrid>

              <Field label={`Module size — ${moduleSize} px`} hint="How big each square is in the preview.">
                <Slider min={3} max={20} value={moduleSize} onChange={setModuleSize} />
              </Field>

              <Field
                label={`Quiet zone — ${style.margin} module${style.margin === 1 ? '' : 's'}`}
                hint={style.margin < 4 ? 'The QR spec asks for at least 4.' : 'The empty border scanners rely on.'}
              >
                <Slider min={0} max={10} value={style.margin} onChange={(margin) => styleSet({ margin })} />
              </Field>

              <Field label="Foreground">
                <ColorInput value={style.foreground} onChange={(foreground) => styleSet({ foreground })} />
              </Field>

              <Field inline label="Gradient" hint="Fade the code into a second colour">
                <Switch
                  checked={style.gradientTo !== null}
                  onCheckedChange={(on) => styleSet({ gradientTo: on ? '#6d4aff' : null })}
                />
              </Field>

              {style.gradientTo !== null && (
                <>
                  <Field label="Gradient colour">
                    <ColorInput value={style.gradientTo} onChange={(gradientTo) => styleSet({ gradientTo })} />
                  </Field>
                  <Field label="Gradient direction">
                    <Select
                      value={style.gradientDirection}
                      onChange={(e) => styleSet({ gradientDirection: e.target.value as GradientDirection })}
                      options={[
                        { value: 'horizontal', label: 'Left to right' },
                        { value: 'vertical', label: 'Top to bottom' },
                        { value: 'diagonal', label: 'Top-left to bottom-right' },
                        { value: 'antidiagonal', label: 'Bottom-left to top-right' },
                      ]}
                    />
                  </Field>
                </>
              )}

              <Field inline label="Transparent background" hint="Export a PNG or SVG with no backdrop">
                <Switch
                  checked={style.transparentBackground}
                  onCheckedChange={(transparentBackground) => styleSet({ transparentBackground })}
                />
              </Field>

              {!style.transparentBackground && (
                <Field label="Background">
                  <ColorInput value={style.background} onChange={(background) => styleSet({ background })} />
                </Field>
              )}
            </div>
          </Section>

          <Section
            title="Centre logo"
            actions={
              logo ? (
                <Button size="sm" variant="ghost" icon="X" onClick={() => setLogo(null)}>
                  Remove
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-3">
              {logo ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <img
                      src={logo.dataUrl}
                      alt=""
                      className="h-9 w-9 rounded-md border border-line object-contain"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{logo.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => void pickLogo()}>
                      Replace
                    </Button>
                  </div>
                  <Field
                    label={`Logo size — ${Math.round(logoRatio * 100)}% of the code`}
                    hint={logoRatio > 0.22 ? 'Above 22% most codes stop scanning.' : 'Keep it small and the code keeps working.'}
                  >
                    <Slider
                      min={8}
                      max={35}
                      value={Math.round(logoRatio * 100)}
                      onChange={(value) => setLogoRatio(value / 100)}
                    />
                  </Field>
                </>
              ) : (
                <Button size="sm" icon="ImagePlus" full onClick={() => void pickLogo()}>
                  Add a logo image
                </Button>
              )}
              {logoError && <Alert tone="danger">{logoError}</Alert>}
            </div>
          </Section>

          <Section title="Export">
            <div className="space-y-3">
              <Field
                label="Image size"
                hint={`Applies to the PNG and the clipboard. The PDF always prints ${PDF_PAGE_INCHES} × ${PDF_PAGE_INCHES} in, at ${Math.round(exportSize / PDF_PAGE_INCHES)} dpi.`}
              >
                <Select
                  value={String(exportSize)}
                  onChange={(e) => setExportSize(Number(e.target.value))}
                  options={EXPORT_SIZES.map((size) => ({ value: String(size), label: `${size} × ${size} px` }))}
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  icon="Download"
                  loading={busy === 'png'}
                  disabled={!bits || Boolean(busy)}
                  onClick={savePng}
                >
                  PNG
                </Button>
                <Button
                  icon="Download"
                  loading={busy === 'svg'}
                  disabled={!bits || Boolean(busy)}
                  onClick={saveSvg}
                >
                  SVG
                </Button>
                <Button
                  icon="Download"
                  loading={busy === 'pdf'}
                  disabled={!bits || Boolean(busy)}
                  onClick={savePdf}
                >
                  PDF
                </Button>
              </div>
              <Button
                variant="secondary"
                icon={copied ? 'Check' : 'Copy'}
                full
                loading={busy === 'copy'}
                disabled={!bits || Boolean(busy)}
                onClick={copyImage}
              >
                {copied ? 'Image copied' : 'Copy image to clipboard'}
              </Button>
              {exportError && <Alert tone="danger">{exportError}</Alert>}
              {saved && (
                <Alert
                  tone="success"
                  title={`Saved ${saved.name}`}
                  action={
                    <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(saved.path)}>
                      Reveal
                    </Button>
                  }
                >
                  {formatBytes(saved.size)} · {shortenPath(dirname(saved.path), 2)}
                </Alert>
              )}
            </div>
          </Section>
        </>
      }
    />
  );
}

// ------------------------------------------------------------------ fields

function ContentFields({
  type,
  form,
  set,
}: {
  type: QrContentType;
  form: QrFormState;
  set: <K extends keyof QrFormState>(key: K, value: QrFormState[K]) => void;
}) {
  switch (type) {
    case 'url':
      return (
        <Field label="Web address" hint="https:// is added when you leave it out.">
          <Input
            value={form.url}
            placeholder="example.com/menu"
            onChange={(e) => set('url', e.target.value)}
            autoFocus
          />
        </Field>
      );

    case 'text':
      return (
        <Field label="Text" hint="Anything at all — it is shown as-is when scanned.">
          <Textarea
            value={form.text}
            placeholder="Table 4 — ask for the daily special"
            rows={4}
            onChange={(e) => set('text', e.target.value)}
          />
        </Field>
      );

    case 'wifi':
      return (
        <div className="space-y-3">
          <OptionsGrid>
            <Field label="Network name (SSID)">
              <Input value={form.wifiSsid} placeholder="Casa Newport" onChange={(e) => set('wifiSsid', e.target.value)} />
            </Field>
            <Field label="Security">
              <Select
                value={form.wifiEncryption}
                onChange={(e) => set('wifiEncryption', e.target.value as WifiEncryption)}
                options={[
                  { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
                  { value: 'WEP', label: 'WEP (old)' },
                  { value: 'nopass', label: 'No password' },
                ]}
              />
            </Field>
          </OptionsGrid>
          {form.wifiEncryption !== 'nopass' && (
            <Field label="Password" hint="Stored only inside the code you export.">
              <Input
                value={form.wifiPassword}
                placeholder="••••••••"
                onChange={(e) => set('wifiPassword', e.target.value)}
              />
            </Field>
          )}
          <Field inline label="Hidden network" hint="The SSID is not broadcast">
            <Switch checked={form.wifiHidden} onCheckedChange={(v) => set('wifiHidden', v)} />
          </Field>
        </div>
      );

    case 'email':
      return (
        <div className="space-y-3">
          <OptionsGrid>
            <Field label="To">
              <Input value={form.emailTo} placeholder="hello@example.com" onChange={(e) => set('emailTo', e.target.value)} />
            </Field>
            <Field label="Subject">
              <Input value={form.emailSubject} placeholder="Booking request" onChange={(e) => set('emailSubject', e.target.value)} />
            </Field>
          </OptionsGrid>
          <Field label="Message">
            <Textarea value={form.emailBody} rows={3} onChange={(e) => set('emailBody', e.target.value)} />
          </Field>
        </div>
      );

    case 'phone':
      return (
        <Field label="Phone number" hint="Include the country code so it works abroad.">
          <Input value={form.phone} placeholder="+34 600 123 456" onChange={(e) => set('phone', e.target.value)} />
        </Field>
      );

    case 'sms':
      return (
        <div className="space-y-3">
          <Field label="Number">
            <Input value={form.smsNumber} placeholder="+34 600 123 456" onChange={(e) => set('smsNumber', e.target.value)} />
          </Field>
          <Field label="Message" hint="Pre-filled in the messaging app; the sender can still edit it.">
            <Textarea value={form.smsMessage} rows={3} onChange={(e) => set('smsMessage', e.target.value)} />
          </Field>
        </div>
      );

    case 'whatsapp':
      return (
        <div className="space-y-3">
          <Field label="WhatsApp number" hint="Country code and number, no + needed.">
            <Input value={form.waNumber} placeholder="34600123456" onChange={(e) => set('waNumber', e.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea value={form.waMessage} rows={3} onChange={(e) => set('waMessage', e.target.value)} />
          </Field>
        </div>
      );

    case 'vcard':
      return (
        <div className="space-y-3">
          <OptionsGrid>
            <Field label="First name">
              <Input value={form.vcFirstName} onChange={(e) => set('vcFirstName', e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={form.vcLastName} onChange={(e) => set('vcLastName', e.target.value)} />
            </Field>
            <Field label="Organisation">
              <Input value={form.vcOrg} onChange={(e) => set('vcOrg', e.target.value)} />
            </Field>
            <Field label="Job title">
              <Input value={form.vcTitle} onChange={(e) => set('vcTitle', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.vcPhone} onChange={(e) => set('vcPhone', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={form.vcEmail} onChange={(e) => set('vcEmail', e.target.value)} />
            </Field>
          </OptionsGrid>
          <Field label="Website">
            <Input value={form.vcUrl} placeholder="https://example.com" onChange={(e) => set('vcUrl', e.target.value)} />
          </Field>
          <Field label="Street">
            <Input value={form.vcStreet} onChange={(e) => set('vcStreet', e.target.value)} />
          </Field>
          <OptionsGrid cols={3}>
            <Field label="City">
              <Input value={form.vcCity} onChange={(e) => set('vcCity', e.target.value)} />
            </Field>
            <Field label="Region">
              <Input value={form.vcRegion} onChange={(e) => set('vcRegion', e.target.value)} />
            </Field>
            <Field label="Postcode">
              <Input value={form.vcPostalCode} onChange={(e) => set('vcPostalCode', e.target.value)} />
            </Field>
          </OptionsGrid>
          <OptionsGrid>
            <Field label="Country">
              <Input value={form.vcCountry} onChange={(e) => set('vcCountry', e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={form.vcNote} onChange={(e) => set('vcNote', e.target.value)} />
            </Field>
          </OptionsGrid>
        </div>
      );

    case 'geo':
      return (
        <OptionsGrid>
          <Field label="Latitude" hint="-90 to 90">
            <Input value={form.geoLatitude} placeholder="40.4168" onChange={(e) => set('geoLatitude', e.target.value)} />
          </Field>
          <Field label="Longitude" hint="-180 to 180">
            <Input value={form.geoLongitude} placeholder="-3.7038" onChange={(e) => set('geoLongitude', e.target.value)} />
          </Field>
        </OptionsGrid>
      );

    case 'event':
      return (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={form.evTitle} placeholder="Toolbox launch" onChange={(e) => set('evTitle', e.target.value)} />
          </Field>
          <OptionsGrid>
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={form.evStart}
                onChange={(e) => set('evStart', e.target.value)}
              />
            </Field>
            <Field label="Ends" hint="Leave empty for one hour.">
              <Input type="datetime-local" value={form.evEnd} onChange={(e) => set('evEnd', e.target.value)} />
            </Field>
          </OptionsGrid>
          <Field label="Location">
            <Input value={form.evLocation} onChange={(e) => set('evLocation', e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={form.evDescription} rows={3} onChange={(e) => set('evDescription', e.target.value)} />
          </Field>
        </div>
      );
  }
}
