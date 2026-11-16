export interface ParsedExifData {
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  latitude?: number;
  longitude?: number;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    if (offset + i >= view.byteLength) break;
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function readRational(view: DataView, offset: number, littleEndian: boolean): number {
  if (offset + 8 > view.byteLength) return 0;
  const num = view.getUint32(offset, littleEndian);
  const den = view.getUint32(offset + 4, littleEndian);
  return den === 0 ? 0 : num / den;
}

function dmsToDecimal(d: number, m: number, s: number, ref: string): number {
  let val = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') val = -val;
  return Number(val.toFixed(6));
}

export function parseExifDateToDate(exifDate?: string): Date | null {
  if (!exifDate) return null;
  const match = exifDate.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min, ss] = match;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatExifDateToVi(exifDate?: string): string | null {
  if (!exifDate) return null;
  // Format is usually "YYYY:MM:DD HH:MM:SS"
  const match = exifDate.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min, ss] = match;
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

export async function parseJpegExif(file: File): Promise<ParsedExifData> {
  const result: ParsedExifData = {};
  try {
    const slice = file.slice(0, 262144); // First 256KB covers EXIF APP1
    const buffer = await slice.arrayBuffer();
    const view = new DataView(buffer);

    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
      return result;
    }

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;

      if (marker === 0xffe1) {
        // APP1 segment
        const length = view.getUint16(offset, false);
        const header = readAscii(view, offset + 2, 4);
        if (header === 'Exif') {
          const tiffOffset = offset + 8;
          if (tiffOffset + 8 > view.byteLength) break;

          const endianMarker = view.getUint16(tiffOffset, false);
          const littleEndian = endianMarker === 0x4949; // "II"
          const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);

          let exifIfdOffset: number | null = null;
          let gpsIfdOffset: number | null = null;

          const parseIfd = (
            ifdStart: number,
            handler: (tag: number, type: number, count: number, valueOffset: number) => void
          ) => {
            if (ifdStart < 0 || ifdStart + 2 > view.byteLength) return;
            const entries = view.getUint16(ifdStart, littleEndian);
            for (let i = 0; i < entries; i++) {
              const entryOffset = ifdStart + 2 + i * 12;
              if (entryOffset + 12 > view.byteLength) break;
              const tag = view.getUint16(entryOffset, littleEndian);
              const type = view.getUint16(entryOffset + 2, littleEndian);
              const count = view.getUint32(entryOffset + 4, littleEndian);
              const rawValOffset = entryOffset + 8;

              const typeSize = type === 2 ? 1 : type === 5 ? 8 : type === 3 ? 2 : 4;
              const totalBytes = count * typeSize;
              const valueOffset =
                totalBytes > 4
                  ? tiffOffset + view.getUint32(rawValOffset, littleEndian)
                  : rawValOffset;

              handler(tag, type, count, valueOffset);
            }
          };

          // IFD0
          parseIfd(tiffOffset + firstIfdOffset, (tag, _type, count, valOffset) => {
            if (tag === 0x010f) result.make = readAscii(view, valOffset, count);
            if (tag === 0x0110) result.model = readAscii(view, valOffset, count);
            if (tag === 0x8769) exifIfdOffset = tiffOffset + view.getUint32(valOffset, littleEndian);
            if (tag === 0x8825) gpsIfdOffset = tiffOffset + view.getUint32(valOffset, littleEndian);
          });

          // ExifIFD
          if (exifIfdOffset !== null) {
            parseIfd(exifIfdOffset, (tag, _type, count, valOffset) => {
              if (tag === 0x9003) {
                result.dateTimeOriginal = readAscii(view, valOffset, count);
              }
            });
          }

          // GPS IFD
          if (gpsIfdOffset !== null) {
            let latRef = 'N';
            let lonRef = 'E';
            let latDms: [number, number, number] | null = null;
            let lonDms: [number, number, number] | null = null;

            parseIfd(gpsIfdOffset, (tag, _type, count, valOffset) => {
              if (tag === 0x0001) latRef = readAscii(view, valOffset, count) || 'N';
              if (tag === 0x0003) lonRef = readAscii(view, valOffset, count) || 'E';
              if (tag === 0x0002 && count >= 3) {
                latDms = [
                  readRational(view, valOffset, littleEndian),
                  readRational(view, valOffset + 8, littleEndian),
                  readRational(view, valOffset + 16, littleEndian),
                ];
              }
              if (tag === 0x0004 && count >= 3) {
                lonDms = [
                  readRational(view, valOffset, littleEndian),
                  readRational(view, valOffset + 8, littleEndian),
                  readRational(view, valOffset + 16, littleEndian),
                ];
              }
            });

            if (latDms && lonDms) {
              result.latitude = dmsToDecimal(latDms[0], latDms[1], latDms[2], latRef);
              result.longitude = dmsToDecimal(lonDms[0], lonDms[1], lonDms[2], lonRef);
            }
          }
        }
        break;
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else if (marker === 0xffda) {
        break;
      } else {
        const segLen = view.getUint16(offset, false);
        offset += segLen;
      }
    }
  } catch {
    // Gracefully return partial or empty EXIF if file has non-standard headers
  }
  return result;
}

export async function reverseGeocodeAddress(lat: number, lon: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=vi`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('Geocode failed');
    const data = await res.json();
    const addr = data.address || {};
    const parts = [
      addr.house_number && addr.road
        ? `${addr.house_number} ${addr.road}`
        : addr.road || addr.amenity || addr.building,
      addr.suburb || addr.quarter || addr.village || addr.town,
      addr.city_district || addr.district || addr.county,
      addr.city || addr.state,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.slice(0, 3).join(', ');
    }
    if (data.display_name) {
      return String(data.display_name).split(',').slice(0, 3).join(',').trim();
    }
  } catch {
    // Fallback to clean coordinate formatting
  }
  return `${lat.toFixed(5)}° N, ${lon.toFixed(5)}° E`;
}
