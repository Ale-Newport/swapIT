/**
 * Draw barcodes with only the encoders this tool offers.
 *
 * bwip-js's generic `toCanvas` / `toSVG` look the encoder up by name at run
 * time, so a bundler has to keep all ~100 symbologies (≈ 900 KB). Importing the
 * eight named encoders lets the rest be tree-shaken away; the output is the same,
 * because the generic functions call these very encoders.
 */
import {
  code128,
  code39,
  datamatrix,
  drawingSVG,
  ean13,
  ean8,
  itf14,
  rationalizedCodabar,
  upca,
  type RenderOptions,
} from 'bwip-js/browser';
import type { BwipOptions } from './logic';

const ENCODERS = { code128, code39, ean13, ean8, upca, itf14, rationalizedCodabar, datamatrix } as const;

type Bcid = keyof typeof ENCODERS;

/** Every symbology the tool lists must have an encoder here (checked by the tests). */
export const SUPPORTED_BCIDS: readonly string[] = Object.keys(ENCODERS);

function encoderFor(bcid: string) {
  if (!(bcid in ENCODERS)) throw new Error(`Toolbox cannot draw “${bcid}” barcodes.`);
  return ENCODERS[bcid as Bcid];
}

export function drawBarcode(canvas: HTMLCanvasElement, options: BwipOptions): HTMLCanvasElement {
  return encoderFor(options.bcid)(canvas, options as RenderOptions) as HTMLCanvasElement;
}

export function barcodeSvg(options: BwipOptions): string {
  return encoderFor(options.bcid)(options as RenderOptions, drawingSVG());
}
