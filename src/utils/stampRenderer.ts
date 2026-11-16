export type StampStyle = 'transparent-split' | 'field-overlay' | 'minimal-corner';

export type NotePosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

export type NoteFontFamily = 'sans' | 'display' | 'serif' | 'mono';

export interface NoteTypography {
  fontFamily: NoteFontFamily;
  bold: boolean;
  italic: boolean;
  color?: string;
  sizeScale?: number;
  opacity?: number;
}

export interface StampPayload {
  imageSrc: string;
  note: string;
  timestamp: string;
  locationText: string;
  coordinates: string;
  deviceModel: string;
  style: StampStyle;
  enabled?: boolean;
  noteTypography?: NoteTypography;
  notePosition?: NotePosition;
}

function buildNoteFont(
  typo: NoteTypography | undefined,
  sizePx: number
): string {
  const family = typo?.fontFamily ?? 'sans';
  const bold = typo?.bold ?? true;
  const italic = typo?.italic ?? false;

  const familyCss =
    family === 'display'
      ? '"Outfit", sans-serif'
      : family === 'serif'
        ? '"Lora", Georgia, serif'
        : family === 'mono'
          ? '"JetBrains Mono", monospace'
          : '"Plus Jakarta Sans", sans-serif';

  // Outfit only loads upright weights on Google Fonts, so emulate slant if needed via Canvas font string
  const weight = bold ? '700' : '400';
  const stylePrefix = italic ? 'italic ' : '';
  return `${stylePrefix}${weight} ${sizePx}px ${familyCss}`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

const imageCache = new Map<string, HTMLImageElement>();

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Không thể tải ảnh để xử lý'));
    img.src = src;
  });
}

function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  // Relative luminance check
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.42;
}

function drawShadowedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  baseUnit: number,
  maxWidth?: number,
  useLightHalo = false
) {
  ctx.save();
  ctx.shadowColor = useLightHalo
    ? 'rgba(255, 255, 255, 0.9)'
    : 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = Math.round(baseUnit * 0.5);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = useLightHalo ? 0 : Math.round(baseUnit * 0.1);
  ctx.lineWidth = Math.max(1.5, Math.round(baseUnit * 0.12));
  ctx.strokeStyle = useLightHalo
    ? 'rgba(255, 255, 255, 0.55)'
    : 'rgba(0, 0, 0, 0.42)';
  if (maxWidth !== undefined) {
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

let sharedOverlayCanvas: HTMLCanvasElement | null = null;

export function renderStampedCanvasFromImage(
  img: HTMLImageElement,
  payload: StampPayload,
  maxEdge = 2400,
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const imgW = Math.round(img.naturalWidth * scale);
  const imgH = Math.round(img.naturalHeight * scale);

  const canvas = targetCanvas || document.createElement('canvas');
  const baseCtx = canvas.getContext('2d');
  if (!baseCtx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D');

  if (canvas.width !== imgW || canvas.height !== imgH) {
    canvas.width = imgW;
    canvas.height = imgH;
  } else {
    baseCtx.clearRect(0, 0, imgW, imgH);
  }
  baseCtx.drawImage(img, 0, 0, imgW, imgH);

  if (payload.enabled === false) {
    return canvas;
  }

  const overlayOpacity = Math.min(
    1,
    Math.max(0.1, payload.noteTypography?.opacity ?? 1)
  );

  if (overlayOpacity >= 0.999) {
    drawStampOverlay(baseCtx, imgW, imgH, payload);
  } else {
    if (!sharedOverlayCanvas) {
      sharedOverlayCanvas = document.createElement('canvas');
    }
    if (sharedOverlayCanvas.width !== imgW || sharedOverlayCanvas.height !== imgH) {
      sharedOverlayCanvas.width = imgW;
      sharedOverlayCanvas.height = imgH;
    }
    const overlayCtx = sharedOverlayCanvas.getContext('2d');
    if (overlayCtx) {
      overlayCtx.clearRect(0, 0, imgW, imgH);
      drawStampOverlay(overlayCtx, imgW, imgH, payload);
      baseCtx.save();
      baseCtx.globalAlpha = overlayOpacity;
      baseCtx.drawImage(sharedOverlayCanvas, 0, 0);
      baseCtx.restore();
    } else {
      drawStampOverlay(baseCtx, imgW, imgH, payload);
    }
  }

  return canvas;
}

function drawStampOverlay(
  ctx: CanvasRenderingContext2D,
  imgW: number,
  imgH: number,
  payload: StampPayload
) {
  const baseUnit = Math.max(12, Math.round(Math.min(imgW, imgH) * 0.022));
  const noteText = payload.note.trim() || 'Chưa có ghi chú';
  const noteColor = payload.noteTypography?.color || '#FFFFFF';
  const useLightHalo = isDarkHex(noteColor);
  const pos: NotePosition = payload.notePosition || 'bottom-left';
  const noteScale = Math.min(2.0, Math.max(0.6, payload.noteTypography?.sizeScale ?? 1));
  const hasCoords = Boolean(payload.coordinates.trim());
  const timeCoordsLine = hasCoords
    ? `${payload.timestamp}  ·  ${payload.coordinates}`
    : payload.timestamp;

  if (payload.style === 'transparent-split') {
    const padX = Math.round(baseUnit * 1.5);
    const padY = Math.round(baseUnit * 1.4);

    const noteFontSize = Math.round(baseUnit * 1.15 * noteScale);
    const noteFont = buildNoteFont(payload.noteTypography, noteFontSize);
    ctx.font = noteFont;
    const maxNoteWidth = pos === 'center' ? Math.round(imgW * 0.78) : Math.round(imgW * 0.54);
    const noteLines = wrapText(ctx, noteText, maxNoteWidth);
    const lineH = Math.round(noteFontSize * 1.34);

    const isTop = pos === 'top-left' || pos === 'top-right';
    const noteOnRight = pos === 'top-right' || pos === 'bottom-right';

    // Draw Note block according to chosen NotePosition
    if (pos === 'center') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const totalH = noteLines.length * lineH;
      let y = Math.round(imgH / 2 - totalH / 2 + lineH / 2);

      if (payload.deviceModel.trim()) {
        ctx.fillStyle = '#FDBA74';
        ctx.font = `700 ${Math.round(baseUnit * 0.86)}px "Outfit", sans-serif`;
        drawShadowedText(ctx, payload.deviceModel.toUpperCase(), Math.round(imgW / 2), y - Math.round(lineH * 0.9), baseUnit);
      }

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (const line of noteLines) {
        drawShadowedText(ctx, line, Math.round(imgW / 2), y, baseUnit, undefined, useLightHalo);
        y += lineH;
      }
    } else if (isTop) {
      ctx.textBaseline = 'top';
      ctx.textAlign = noteOnRight ? 'right' : 'left';
      const noteX = noteOnRight ? imgW - padX : padX;
      let noteY = padY;

      if (payload.deviceModel.trim()) {
        ctx.fillStyle = '#FDBA74';
        ctx.font = `700 ${Math.round(baseUnit * 0.86)}px "Outfit", sans-serif`;
        drawShadowedText(ctx, payload.deviceModel.toUpperCase(), noteX, noteY, baseUnit);
        noteY += Math.round(baseUnit * 1.25);
      }

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (const line of noteLines) {
        drawShadowedText(ctx, line, noteX, noteY, baseUnit, undefined, useLightHalo);
        noteY += lineH;
      }
    } else {
      ctx.textBaseline = 'bottom';
      ctx.textAlign = noteOnRight ? 'right' : 'left';
      const noteX = noteOnRight ? imgW - padX : padX;
      let noteY = imgH - padY;

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (let i = noteLines.length - 1; i >= 0; i--) {
        drawShadowedText(ctx, noteLines[i], noteX, noteY, baseUnit, undefined, useLightHalo);
        noteY -= lineH;
      }

      if (payload.deviceModel.trim()) {
        ctx.fillStyle = '#FDBA74';
        ctx.font = `700 ${Math.round(baseUnit * 0.86)}px "Outfit", sans-serif`;
        drawShadowedText(ctx, payload.deviceModel.toUpperCase(), noteX, noteY - Math.round(baseUnit * 0.2), baseUnit);
      }
    }

    // Draw Metadata (Timestamp + Location + Coords) on opposite side cleanly
    const metaOnRight = pos === 'center' ? true : !noteOnRight;
    const metaX = metaOnRight ? imgW - padX : padX;
    ctx.textAlign = metaOnRight ? 'right' : 'left';

    if (isTop) {
      ctx.textBaseline = 'top';
      let metaY = padY;

      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.94)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, payload.timestamp, metaX, metaY, baseUnit, Math.round(imgW * 0.4));

      metaY += Math.round(baseUnit * 1.35);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `600 ${Math.round(baseUnit * 0.9)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, metaX, metaY, baseUnit, Math.round(imgW * 0.4));

      if (hasCoords) {
        metaY += Math.round(baseUnit * 1.25);
        ctx.fillStyle = 'rgba(241, 245, 249, 0.94)';
        ctx.font = `500 ${Math.round(baseUnit * 0.8)}px "JetBrains Mono", monospace`;
        drawShadowedText(ctx, payload.coordinates, metaX, metaY, baseUnit, Math.round(imgW * 0.4));
      }
    } else {
      ctx.textBaseline = 'bottom';
      let metaY = imgH - padY;

      if (hasCoords) {
        ctx.fillStyle = 'rgba(241, 245, 249, 0.94)';
        ctx.font = `500 ${Math.round(baseUnit * 0.8)}px "JetBrains Mono", monospace`;
        drawShadowedText(ctx, payload.coordinates, metaX, metaY, baseUnit, Math.round(imgW * 0.4));
        metaY -= Math.round(baseUnit * 1.25);
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `600 ${Math.round(baseUnit * 0.9)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, metaX, metaY, baseUnit, Math.round(imgW * 0.4));

      metaY -= Math.round(baseUnit * 1.35);
      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.94)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, payload.timestamp, metaX, metaY, baseUnit, Math.round(imgW * 0.4));
    }

    ctx.textAlign = 'left';
  } else if (payload.style === 'field-overlay') {
    const padX = Math.round(baseUnit * 1.4);
    const padY = Math.round(baseUnit * 1.3);
    const noteFontSize = Math.round(baseUnit * 1.18 * noteScale);
    const noteFont = buildNoteFont(payload.noteTypography, noteFontSize);
    ctx.font = noteFont;
    const maxW = pos === 'center' ? Math.round(imgW * 0.8) : imgW - padX * 2;
    const noteLines = wrapText(ctx, noteText, maxW);
    const lineH = Math.round(noteFontSize * 1.34);
    const contentHeight = noteLines.length * lineH + baseUnit * 4.2;

    // Adaptive transparent gradient scrim for chosen region
    if (pos === 'top-left' || pos === 'top-right') {
      const bandH = contentHeight + baseUnit * 3.5;
      const grad = ctx.createLinearGradient(0, 0, 0, bandH);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, imgW, bandH);
    } else if (pos === 'center') {
      const cy = Math.round(imgH / 2);
      const halfBand = Math.round(contentHeight / 2 + baseUnit * 2.5);
      const grad = ctx.createLinearGradient(0, cy - halfBand, 0, cy + halfBand);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, cy - halfBand, imgW, halfBand * 2);
    } else {
      const grad = ctx.createLinearGradient(0, imgH - contentHeight - baseUnit * 3.5, 0, imgH);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, imgH - contentHeight - baseUnit * 3.5, imgW, contentHeight + baseUnit * 3.5);
    }

    const align: CanvasTextAlign =
      pos === 'center'
        ? 'center'
        : pos === 'top-right' || pos === 'bottom-right'
          ? 'right'
          : 'left';
    const anchorX =
      pos === 'center'
        ? Math.round(imgW / 2)
        : pos === 'top-right' || pos === 'bottom-right'
          ? imgW - padX
          : padX;
    ctx.textAlign = align;

    if (pos === 'top-left' || pos === 'top-right') {
      ctx.textBaseline = 'top';
      let y = padY;

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (const line of noteLines) {
        drawShadowedText(ctx, line, anchorX, y, baseUnit, undefined, useLightHalo);
        y += lineH;
      }

      y += Math.round(baseUnit * 0.45);
      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.92)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, anchorX, y, baseUnit, maxW);

      y += Math.round(baseUnit * 1.45);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
      ctx.font = `500 ${Math.round(baseUnit * 0.84)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, timeCoordsLine, anchorX, y, baseUnit, maxW);
    } else if (pos === 'center') {
      ctx.textBaseline = 'middle';
      const totalH = noteLines.length * lineH + Math.round(baseUnit * 3.2);
      let y = Math.round(imgH / 2 - totalH / 2 + lineH / 2);

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (const line of noteLines) {
        drawShadowedText(ctx, line, anchorX, y, baseUnit, undefined, useLightHalo);
        y += lineH;
      }

      y += Math.round(baseUnit * 0.45);
      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.92)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, anchorX, y, baseUnit, maxW);

      y += Math.round(baseUnit * 1.45);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
      ctx.font = `500 ${Math.round(baseUnit * 0.84)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, timeCoordsLine, anchorX, y, baseUnit, maxW);
    } else {
      ctx.textBaseline = 'bottom';
      let y = imgH - padY;

      ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
      ctx.font = `500 ${Math.round(baseUnit * 0.84)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, timeCoordsLine, anchorX, y, baseUnit, maxW);
      y -= Math.round(baseUnit * 1.45);

      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.92)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, anchorX, y, baseUnit, maxW);
      y -= Math.round(baseUnit * 1.65);

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (let i = noteLines.length - 1; i >= 0; i--) {
        drawShadowedText(ctx, noteLines[i], anchorX, y, baseUnit, undefined, useLightHalo);
        y -= lineH;
      }
    }
    ctx.textAlign = 'left';
  } else {
    // minimal-corner: pure transparent text block positioned at chosen corner or center
    const padX = Math.round(baseUnit * 1.4);
    const padY = Math.round(baseUnit * 1.3);
    const noteFontSize = Math.round(baseUnit * 1.02 * noteScale);
    const noteFont = buildNoteFont(payload.noteTypography, noteFontSize);
    ctx.font = noteFont;
    const maxW = pos === 'center' ? Math.round(imgW * 0.76) : Math.round(imgW * 0.65);
    const noteLines = wrapText(ctx, noteText, maxW);
    const lineH = Math.round(noteFontSize * 1.34);

    const align: CanvasTextAlign =
      pos === 'center'
        ? 'center'
        : pos === 'top-right' || pos === 'bottom-right'
          ? 'right'
          : 'left';
    const anchorX =
      pos === 'center'
        ? Math.round(imgW / 2)
        : pos === 'top-right' || pos === 'bottom-right'
          ? imgW - padX
          : padX;
    ctx.textAlign = align;

    if (pos === 'top-left' || pos === 'top-right') {
      ctx.textBaseline = 'top';
      let curY = padY;

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (const line of noteLines) {
        drawShadowedText(ctx, line, anchorX, curY, baseUnit, undefined, useLightHalo);
        curY += lineH;
      }

      curY += Math.round(baseUnit * 0.35);
      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.85)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, anchorX, curY, baseUnit, Math.round(imgW * 0.8));

      curY += Math.round(baseUnit * 1.25);
      ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
      ctx.font = `500 ${Math.round(baseUnit * 0.78)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, timeCoordsLine, anchorX, curY, baseUnit, Math.round(imgW * 0.8));
    } else if (pos === 'center') {
      ctx.textBaseline = 'middle';
      const totalH = noteLines.length * lineH + Math.round(baseUnit * 2.8);
      let curY = Math.round(imgH / 2 - totalH / 2 + lineH / 2);

      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (const line of noteLines) {
        drawShadowedText(ctx, line, anchorX, curY, baseUnit, undefined, useLightHalo);
        curY += lineH;
      }

      curY += Math.round(baseUnit * 0.35);
      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.85)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, anchorX, curY, baseUnit, Math.round(imgW * 0.8));

      curY += Math.round(baseUnit * 1.25);
      ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
      ctx.font = `500 ${Math.round(baseUnit * 0.78)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, timeCoordsLine, anchorX, curY, baseUnit, Math.round(imgW * 0.8));
    } else {
      ctx.textBaseline = 'bottom';
      let curY = imgH - padY;

      ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
      ctx.font = `500 ${Math.round(baseUnit * 0.78)}px "JetBrains Mono", monospace`;
      drawShadowedText(ctx, timeCoordsLine, anchorX, curY, baseUnit, Math.round(imgW * 0.8));

      curY -= Math.round(baseUnit * 1.25);
      ctx.fillStyle = '#FDBA74';
      ctx.font = `600 ${Math.round(baseUnit * 0.85)}px "Plus Jakarta Sans", sans-serif`;
      drawShadowedText(ctx, payload.locationText, anchorX, curY, baseUnit, Math.round(imgW * 0.8));

      curY -= Math.round(baseUnit * 1.4);
      ctx.fillStyle = noteColor;
      ctx.font = noteFont;
      for (let i = noteLines.length - 1; i >= 0; i--) {
        drawShadowedText(ctx, noteLines[i], anchorX, curY, baseUnit, undefined, useLightHalo);
        curY -= lineH;
      }
    }
    ctx.textAlign = 'left';
  }
}

export async function renderStampedCanvas(
  payload: StampPayload,
  maxEdge = 2400
): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(payload.imageSrc);
  return renderStampedCanvasFromImage(img, payload, maxEdge);
}

export async function exportStampedJpeg(payload: StampPayload): Promise<{
  blob: Blob;
  thumbnailDataUrl: string;
}> {
  const fullCanvas = await renderStampedCanvas(payload, 2600);
  const blob = await new Promise<Blob>((resolve, reject) => {
    fullCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Không thể xuất ảnh JPEG'))),
      'image/jpeg',
      0.93
    );
  });

  // Compact thumbnail for local history
  const thumbCanvas = document.createElement('canvas');
  const maxThumb = 420;
  const ratio = Math.min(1, maxThumb / Math.max(fullCanvas.width, fullCanvas.height));
  thumbCanvas.width = Math.round(fullCanvas.width * ratio);
  thumbCanvas.height = Math.round(fullCanvas.height * ratio);
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) {
    tCtx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

  return { blob, thumbnailDataUrl };
}
