import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Camera,
  Check,
  Clock,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Italic,
  LocateFixed,
  MapPin,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  parseExifDateToDate,
  parseJpegExif,
  reverseGeocodeAddress,
} from '../utils/exifParser';
import {
  exportStampedJpeg,
  loadImageElement,
  NoteFontFamily,
  NotePosition,
  NoteTypography,
  renderStampedCanvasFromImage,
  StampStyle,
} from '../utils/stampRenderer';

export interface SavedPhotoRecord {
  id: string;
  thumbnailDataUrl: string;
  note: string;
  timestamp: string;
  locationText: string;
  coordinates: string;
  style: StampStyle;
  createdAt: number;
}

interface SampleOption {
  id: string;
  label: string;
  src: string;
  defaultNote: string;
  defaultCoords: { lat: number; lon: number };
  defaultAddress: string;
}

const SAMPLE_PHOTOS: SampleOption[] = [
  {
    id: 'site',
    label: 'Ảnh khảo sát công trình',
    src: '/src/assets/images/sample_site_inspection_1794833251978.jpg',
    defaultNote: 'Nghiệm thu cột trục B2 và giàn giáo mặt tiền tầng 2',
    defaultCoords: { lat: 10.77689, lon: 106.7009 },
    defaultAddress: 'Đường Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
  },
  {
    id: 'street',
    label: 'Ảnh hiện trường tuyến phố',
    src: '/src/assets/images/sample_street_scene_1794833251230.jpg',
    defaultNote: 'Khảo sát điểm giao hàng buổi sáng — mặt bằng thông thoáng',
    defaultCoords: { lat: 21.02851, lon: 105.85416 },
    defaultAddress: 'Phố Hàng Bông, Hoàn Kiếm, Hà Nội',
  },
];

const QUICK_NOTES = [
  'Khảo sát hiện trường',
  'Nghiệm thu hạng mục đạt yêu cầu',
  'Đã giao nhận tại địa điểm',
  'Cần kiểm tra bổ sung kỹ thuật',
];

const HISTORY_STORAGE_KEY = 'camnote_redmi_history_v1';
const NOTE_MODE_STORAGE_KEY = 'camera_note_mode_enabled_v1';
const NOTE_TYPOGRAPHY_STORAGE_KEY = 'camera_note_typography_v1';
const NOTE_POSITION_STORAGE_KEY = 'camera_note_position_v1';
const TIMESTAMP_FORMAT_STORAGE_KEY = 'camera_timestamp_format_v1';
const COORD_FORMAT_STORAGE_KEY = 'camera_coord_format_v1';

type TimestampFormat =
  | 'ddmmyyyy-hhmmss'
  | 'ddmmyyyy-hhmm'
  | 'ddmmyyyy'
  | 'hhmm'
  | 'full-vi';

type CoordFormat = 'decimal-dir' | 'decimal-signed' | 'dms' | 'hidden';

const COORD_FORMAT_OPTIONS: { id: CoordFormat; label: string }[] = [
  { id: 'decimal-dir', label: 'Thập phân (N/E)' },
  { id: 'decimal-signed', label: 'Thập phân thuần' },
  { id: 'dms', label: 'Độ - Phút - Giây' },
  { id: 'hidden', label: 'Ẩn tọa độ' },
];

const TIMESTAMP_FORMAT_OPTIONS: { id: TimestampFormat; label: string }[] = [
  { id: 'ddmmyyyy-hhmmss', label: 'dd/mm/yyyy hh:mm:ss' },
  { id: 'ddmmyyyy-hhmm', label: 'dd/mm/yyyy hh:mm' },
  { id: 'ddmmyyyy', label: 'dd/mm/yyyy' },
  { id: 'hhmm', label: 'hh:mm' },
  { id: 'full-vi', label: 'Ngày tháng đầy đủ' },
];

const POSITION_OPTIONS: { id: NotePosition; label: string }[] = [
  { id: 'top-left', label: 'Trên trái' },
  { id: 'top-right', label: 'Trên phải' },
  { id: 'center', label: 'Giữa ảnh' },
  { id: 'bottom-left', label: 'Dưới trái' },
  { id: 'bottom-right', label: 'Dưới phải' },
];

const FONT_OPTIONS: {
  id: NoteFontFamily;
  label: string;
  previewClass: string;
}[] = [
  { id: 'sans', label: 'Hiện đại', previewClass: 'font-sans' },
  { id: 'display', label: 'Nổi bật', previewClass: 'font-display' },
  { id: 'serif', label: 'Có chân', previewClass: 'font-serif-note' },
  { id: 'mono', label: 'Kỹ thuật', previewClass: 'font-mono' },
];

const COLOR_PRESETS: {
  hex: string;
  label: string;
  swatchClass: string;
}[] = [
  { hex: '#FFFFFF', label: 'Trắng sáng', swatchClass: 'bg-white border-slate-300' },
  { hex: '#FDE047', label: 'Vàng nổi bật', swatchClass: 'bg-yellow-300 border-yellow-400' },
  { hex: '#FB923C', label: 'Cam ấm', swatchClass: 'bg-orange-400 border-orange-500' },
  { hex: '#34D399', label: 'Xanh ngọc', swatchClass: 'bg-emerald-400 border-emerald-500' },
  { hex: '#38BDF8', label: 'Xanh trời', swatchClass: 'bg-sky-400 border-sky-500' },
  { hex: '#0F172A', label: 'Đen than (ảnh sáng)', swatchClass: 'bg-slate-900 border-slate-950' },
];

function formatDateByPreset(d: Date, format: TimestampFormat): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  switch (format) {
    case 'ddmmyyyy-hhmm':
      return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    case 'ddmmyyyy':
      return `${dd}/${mm}/${yyyy}`;
    case 'hhmm':
      return `${hh}:${min}`;
    case 'full-vi':
      return `Ngày ${dd} tháng ${mm} năm ${yyyy}, ${hh}:${min}`;
    case 'ddmmyyyy-hhmmss':
    default:
      return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  }
}

function toDmsString(val: number, posRef: string, negRef: string): string {
  const ref = val >= 0 ? posRef : negRef;
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  return `${deg}°${String(min).padStart(2, '0')}'${sec.padStart(4, '0')}"${ref}`;
}

function formatCoordsByPreset(
  lat: number,
  lon: number,
  format: CoordFormat
): string {
  switch (format) {
    case 'decimal-signed':
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    case 'dms':
      return `${toDmsString(lat, 'N', 'S')}, ${toDmsString(lon, 'E', 'W')}`;
    case 'hidden':
      return '';
    case 'decimal-dir':
    default:
      return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(
        lon
      ).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`;
  }
}

interface CameraAddinWorkbenchProps {
  externalTriggerCount: number;
}

export default function CameraAddinWorkbench({
  externalTriggerCount,
}: CameraAddinWorkbenchProps) {
  const fileGalleryRef = useRef<HTMLInputElement>(null);
  const fileCameraRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const miniPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImageRef = useRef<{ src: string; img: HTMLImageElement } | null>(null);

  const [selectedSampleId, setSelectedSampleId] = useState<string>('site');
  const [imageSrc, setImageSrc] = useState<string>(SAMPLE_PHOTOS[0].src);
  const [deviceModel, setDeviceModel] = useState<string>('');
  const [note, setNote] = useState<string>(SAMPLE_PHOTOS[0].defaultNote);
  const [timestampFormat, setTimestampFormat] = useState<TimestampFormat>(() => {
    try {
      const saved = localStorage.getItem(TIMESTAMP_FORMAT_STORAGE_KEY);
      if (
        saved === 'ddmmyyyy-hhmmss' ||
        saved === 'ddmmyyyy-hhmm' ||
        saved === 'ddmmyyyy' ||
        saved === 'hhmm' ||
        saved === 'full-vi'
      ) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'ddmmyyyy-hhmmss';
  });
  const [captureDate, setCaptureDate] = useState<Date>(() => new Date());
  const [timestamp, setTimestamp] = useState<string>(() =>
    formatDateByPreset(new Date(), timestampFormat)
  );
  const [locationText, setLocationText] = useState<string>(
    SAMPLE_PHOTOS[0].defaultAddress
  );
  const [coordFormat, setCoordFormat] = useState<CoordFormat>(() => {
    try {
      const saved = localStorage.getItem(COORD_FORMAT_STORAGE_KEY);
      if (
        saved === 'decimal-dir' ||
        saved === 'decimal-signed' ||
        saved === 'dms' ||
        saved === 'hidden'
      ) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'decimal-dir';
  });
  const [rawCoords, setRawCoords] = useState<{ lat: number; lon: number } | null>(
    SAMPLE_PHOTOS[0].defaultCoords
  );
  const [coordinates, setCoordinates] = useState<string>(() =>
    formatCoordsByPreset(
      SAMPLE_PHOTOS[0].defaultCoords.lat,
      SAMPLE_PHOTOS[0].defaultCoords.lon,
      coordFormat
    )
  );
  const [stampStyle, setStampStyle] = useState<StampStyle>('transparent-split');
  const [isNoteModeEnabled, setIsNoteModeEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(NOTE_MODE_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [noteTypography, setNoteTypography] = useState<NoteTypography>(() => {
    try {
      const raw = localStorage.getItem(NOTE_TYPOGRAPHY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          fontFamily: parsed.fontFamily || 'sans',
          bold: typeof parsed.bold === 'boolean' ? parsed.bold : true,
          italic: typeof parsed.italic === 'boolean' ? parsed.italic : false,
          color: typeof parsed.color === 'string' ? parsed.color : '#FFFFFF',
          sizeScale:
            typeof parsed.sizeScale === 'number' ? parsed.sizeScale : 1,
          opacity: typeof parsed.opacity === 'number' ? parsed.opacity : 1,
        };
      }
    } catch {
      // Ignore storage error
    }
    return {
      fontFamily: 'sans',
      bold: true,
      italic: false,
      color: '#FFFFFF',
      sizeScale: 1,
      opacity: 1,
    };
  });
  const [notePosition, setNotePosition] = useState<NotePosition>(() => {
    try {
      const saved = localStorage.getItem(NOTE_POSITION_STORAGE_KEY);
      if (
        saved === 'top-left' ||
        saved === 'top-right' ||
        saved === 'bottom-left' ||
        saved === 'bottom-right' ||
        saved === 'center'
      ) {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'bottom-left';
  });

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationStatus, setLocationStatus] = useState<string>('');
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);
  const [isComparingOriginal, setIsComparingOriginal] = useState<boolean>(false);
  const [showMobileMiniPreview, setShowMobileMiniPreview] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string>('');

  // Simulated Xiaomi Camera floating add-in overlay state
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);
  const [showFloatingAddin, setShowFloatingAddin] = useState<boolean>(false);
  const [overlayDraftNote, setOverlayDraftNote] = useState<string>('');

  const [history, setHistory] = useState<SavedPhotoRecord[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Trigger file picker when user clicks CTA in top bar
  useEffect(() => {
    if (externalTriggerCount > 0) {
      fileGalleryRef.current?.click();
    }
  }, [externalTriggerCount]);

  // Render live Canvas preview synchronously when image is cached (zero-flicker real-time updates)
  useEffect(() => {
    let active = true;
    const payload = {
      imageSrc,
      note,
      timestamp,
      locationText,
      coordinates,
      deviceModel,
      style: stampStyle,
      enabled: isNoteModeEnabled && !isComparingOriginal,
      noteTypography,
      notePosition,
    };

    const drawToCanvases = (img: HTMLImageElement) => {
      if (previewCanvasRef.current) {
        renderStampedCanvasFromImage(img, payload, 1200, previewCanvasRef.current);
      }
      if (miniPreviewCanvasRef.current) {
        renderStampedCanvasFromImage(img, payload, 720, miniPreviewCanvasRef.current);
      }
    };

    const cached = loadedImageRef.current;
    if (cached && cached.src === imageSrc) {
      drawToCanvases(cached.img);
      return () => {
        active = false;
      };
    }

    const loadAndDraw = async () => {
      setIsLoadingImage(true);
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        const img = await loadImageElement(imageSrc);
        if (!active) return;
        loadedImageRef.current = { src: imageSrc, img };
        drawToCanvases(img);
      } catch {
        // Ignore transient image decode errors
      } finally {
        if (active) setIsLoadingImage(false);
      }
    };

    loadAndDraw();
    return () => {
      active = false;
    };
  }, [
    imageSrc,
    note,
    timestamp,
    locationText,
    coordinates,
    deviceModel,
    stampStyle,
    isNoteModeEnabled,
    isComparingOriginal,
    showMobileMiniPreview,
    noteTypography,
    notePosition,
  ]);

  const updateTimestampFormat = useCallback(
    (nextFormat: TimestampFormat) => {
      setTimestampFormat(nextFormat);
      setTimestamp(formatDateByPreset(captureDate, nextFormat));
      try {
        localStorage.setItem(TIMESTAMP_FORMAT_STORAGE_KEY, nextFormat);
      } catch {
        // Ignore storage error
      }
    },
    [captureDate]
  );

  const applyCaptureDate = useCallback(
    (date: Date) => {
      setCaptureDate(date);
      setTimestamp(formatDateByPreset(date, timestampFormat));
    },
    [timestampFormat]
  );

  const applyRawCoords = useCallback(
    (lat: number, lon: number) => {
      setRawCoords({ lat, lon });
      setCoordinates(formatCoordsByPreset(lat, lon, coordFormat));
    },
    [coordFormat]
  );

  const updateCoordFormat = useCallback(
    (nextFormat: CoordFormat) => {
      setCoordFormat(nextFormat);
      if (rawCoords) {
        setCoordinates(formatCoordsByPreset(rawCoords.lat, rawCoords.lon, nextFormat));
      } else if (nextFormat === 'hidden') {
        setCoordinates('');
      }
      try {
        localStorage.setItem(COORD_FORMAT_STORAGE_KEY, nextFormat);
      } catch {
        // Ignore storage error
      }
    },
    [rawCoords]
  );

  const updateNotePosition = useCallback((nextPos: NotePosition) => {
    setNotePosition(nextPos);
    try {
      localStorage.setItem(NOTE_POSITION_STORAGE_KEY, nextPos);
    } catch {
      // Ignore storage error
    }
  }, []);

  const updateNoteTypography = useCallback(
    (patch: Partial<NoteTypography>) => {
      setNoteTypography((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(NOTE_TYPOGRAPHY_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage error
        }
        return next;
      });
    },
    []
  );

  const toggleNoteMode = useCallback((nextValue?: boolean) => {
    setIsNoteModeEnabled((prev) => {
      const next = typeof nextValue === 'boolean' ? nextValue : !prev;
      if (!next) {
        setShowFloatingAddin(false);
      }
      try {
        localStorage.setItem(NOTE_MODE_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const persistHistory = useCallback((items: SavedPhotoRecord[]) => {
    setHistory(items);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
    } catch {
      // Ignore quota exceeded gracefully
    }
  }, []);

  const fetchCurrentGps = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationStatus('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    setIsLocating(true);
    setLocationStatus('Đang lấy tọa độ GPS...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        applyRawCoords(lat, lon);
        setLocationStatus('Đang tra cứu tên đường...');
        const resolved = await reverseGeocodeAddress(lat, lon);
        setLocationText(resolved);
        applyCaptureDate(new Date());
        setLocationStatus('Đã cập nhật vị trí và giờ thực tế.');
        setIsLocating(false);
      },
      () => {
        setLocationStatus(
          'Chưa được cấp quyền vị trí. Bạn có thể nhập tay hoặc bật GPS trình duyệt.'
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [applyCaptureDate, applyRawCoords]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setImageSrc(objectUrl);
    setSelectedSampleId('custom');
    setSaveFeedback('');

    // Extract real EXIF from captured photo
    const exif = await parseJpegExif(file);
    if (exif.model) {
      setDeviceModel(exif.model);
    } else {
      setDeviceModel('');
    }

    const exifDateObj = parseExifDateToDate(exif.dateTimeOriginal);
    applyCaptureDate(exifDateObj || new Date());

    if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
      applyRawCoords(exif.latitude, exif.longitude);
      setLocationStatus('Đang dịch tọa độ EXIF từ ảnh...');
      const addr = await reverseGeocodeAddress(exif.latitude, exif.longitude);
      setLocationText(addr);
      setLocationStatus('Đã tự động đọc thời gian & GPS từ EXIF ảnh.');
    } else {
      setLocationStatus('Ảnh chưa có EXIF GPS — đang thử lấy vị trí thiết bị...');
      fetchCurrentGps();
    }

    // Pop up the add-in note sheet right after selecting/capturing a photo only if note mode is enabled
    if (isNoteModeEnabled) {
      setOverlayDraftNote(note);
      setShowFloatingAddin(true);
    }
    e.target.value = '';
  };

  const handleSelectSample = (sample: SampleOption) => {
    setSelectedSampleId(sample.id);
    setImageSrc(sample.src);
    setNote(sample.defaultNote);
    setLocationText(sample.defaultAddress);
    applyRawCoords(sample.defaultCoords.lat, sample.defaultCoords.lon);
    applyCaptureDate(new Date());
    setDeviceModel('');
    setLocationStatus('');
    setSaveFeedback('');
  };

  const simulateXiaomiShutterAddin = () => {
    setShutterFlash(true);
    applyCaptureDate(new Date());
    setOverlayDraftNote(note);
    setTimeout(() => {
      setShutterFlash(false);
      if (isNoteModeEnabled) {
        setShowFloatingAddin(true);
      } else {
        setSaveFeedback('Chế độ ghi chú đang tắt — ảnh giữ nguyên bản gốc không hiện bảng nhập.');
      }
    }, 260);
  };

  const applyOverlayNoteAndSave = async () => {
    setNote(overlayDraftNote);
    setShowFloatingAddin(false);
    await handleExportAndSave(overlayDraftNote);
  };

  const handleExportAndSave = async (overrideNote?: string) => {
    const activeNote = overrideNote !== undefined ? overrideNote : note;
    setIsSaving(true);
    setSaveFeedback('');
    try {
      const { blob, thumbnailDataUrl } = await exportStampedJpeg({
        imageSrc,
        note: activeNote,
        timestamp,
        locationText,
        coordinates,
        deviceModel,
        style: stampStyle,
        enabled: isNoteModeEnabled,
        noteTypography,
        notePosition,
      });

      // Trigger file download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = isNoteModeEnabled ? `Anh_GhiChu_${safeStamp}.jpg` : `Anh_Goc_${safeStamp}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const newRecord: SavedPhotoRecord = {
        id: `${Date.now()}`,
        thumbnailDataUrl,
        note: isNoteModeEnabled ? (activeNote.trim() || 'Không có ghi chú') : 'Ảnh gốc (đã tắt ghi chú)',
        timestamp,
        locationText: isNoteModeEnabled ? locationText : 'Không gắn vị trí',
        coordinates,
        style: stampStyle,
        createdAt: Date.now(),
      };
      persistHistory([newRecord, ...history].slice(0, 8));
      setSaveFeedback(
        isNoteModeEnabled
          ? 'Đã xuất ảnh JPEG gắn ghi chú, vị trí & thời gian.'
          : 'Đã xuất ảnh gốc (không gắn chữ ghi chú).'
      );
    } catch {
      setSaveFeedback('Không thể xuất ảnh, vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeHistoryItem = (id: string) => {
    persistHistory(history.filter((item) => item.id !== id));
  };

  const activeFontLabel =
    FONT_OPTIONS.find((f) => f.id === noteTypography.fontFamily)?.label || 'Hiện đại';
  const activePositionLabel =
    POSITION_OPTIONS.find((p) => p.id === notePosition)?.label || 'Dưới trái';

  return (
    <div className="space-y-8">
      {/* Hidden native inputs for mobile browser */}
      <input
        ref={fileGalleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={fileCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Main 2-column studio grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Sticky Real-Time Preview Stage + Simulated Floating Overlay Add-in */}
        <section
          id="live-preview-stage"
          className="lg:col-span-7 lg:sticky lg:top-6 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-600 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">
                  Xem trước thời gian thực
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {deviceModel ? `${deviceModel} · ${timestamp}` : `Cập nhật trực tiếp · ${timestamp}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_PHOTOS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    selectedSampleId === sample.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {sample.id === 'site' ? 'Mẫu công trình' : 'Mẫu đường phố'}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={isComparingOriginal}
                onClick={() => setIsComparingOriginal((prev) => !prev)}
                className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isComparingOriginal
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {isComparingOriginal ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Đang xem ảnh gốc</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>So sánh ảnh gốc</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Photo canvas container with real-time overlay preview */}
          <div className="relative my-4 bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center min-h-[320px] sm:min-h-[420px]">
            <canvas
              ref={previewCanvasRef}
              className={`max-w-full max-h-[540px] w-auto h-auto object-contain transition-opacity duration-150 ${
                isLoadingImage ? 'opacity-60' : 'opacity-100'
              }`}
            />

            {isLoadingImage && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 pointer-events-none">
                <RefreshCw className="w-6 h-6 text-white animate-spin" />
              </div>
            )}

            {/* Shutter flash feedback */}
            {shutterFlash && (
              <div className="absolute inset-0 bg-white/90 pointer-events-none transition-opacity duration-150" />
            )}

            {/* Simulated Xiaomi Post-Capture Floating Overlay Sheet */}
            {showFloatingAddin && (
              <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] flex items-end justify-center p-3 sm:p-4 z-20">
                <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-orange-600 shrink-0" />
                      <span className="text-sm font-semibold text-slate-900">
                        Ghi chú nhanh sau khi chụp
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFloatingAddin(false)}
                      aria-label="Đóng bảng nổi"
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                      <span className="truncate">{locationText}</span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {coordinates ? `${timestamp} · ${coordinates}` : timestamp}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={overlayDraftNote}
                    onChange={(e) => {
                      setOverlayDraftNote(e.target.value);
                      setNote(e.target.value);
                    }}
                    placeholder="Nhập ghi chú cho bức ảnh vừa chụp..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    autoFocus
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFloatingAddin(false)}
                      className="flex-1 min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap"
                    >
                      Chỉ áp dụng xem trước
                    </button>
                    <button
                      type="button"
                      onClick={applyOverlayNoteAndSave}
                      className="flex-1 min-h-[44px] px-3 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl whitespace-nowrap"
                    >
                      Lưu ảnh ngay
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live active parameters summary line */}
          <p className="text-xs text-slate-500 pb-3 tabular-nums">
            {isComparingOriginal
              ? 'Đang tạm ẩn lớp phủ để đối chiếu ảnh gốc'
              : isNoteModeEnabled
                ? `Lớp phủ: Đang bật · Vị trí: ${activePositionLabel} · Phông: ${activeFontLabel} (${Math.round(
                    (noteTypography.sizeScale ?? 1) * 100
                  )}% · Độ mờ ${Math.round((noteTypography.opacity ?? 1) * 100)}%)`
                : 'Chế độ ghi chú đang tắt · Ảnh giữ nguyên bản gốc'}
          </p>

          {/* Bottom quick action bar inside preview card */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileCameraRef.current?.click()}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                <Camera className="w-4 h-4" />
                Chụp ảnh mới
              </button>
              <button
                type="button"
                onClick={() => fileGalleryRef.current?.click()}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                <ImagePlus className="w-4 h-4" />
                Chọn từ DCIM/Camera
              </button>
            </div>

            <button
              type="button"
              onClick={simulateXiaomiShutterAddin}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              Mô phỏng bật Add-in
            </button>
          </div>
        </section>

        {/* Right: Note, Location, Timestamp & Export Controls */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-5">
            {/* Master ON/OFF Switch for Note Mode */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Chế độ hiển thị ghi chú
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isNoteModeEnabled
                    ? 'Đang bật · Tự gắn ghi chú, vị trí & thời gian lên ảnh'
                    : 'Đang tắt · Giữ ảnh gốc sạch, không bật bảng ghi chú'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isNoteModeEnabled}
                aria-label="Bật hoặc tắt chế độ hiển thị ghi chú"
                onClick={() => toggleNoteMode()}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  isNoteModeEnabled ? 'bg-orange-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                    isNoteModeEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {!isNoteModeEnabled ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-slate-800">
                  Chế độ ghi chú đang tạm tắt
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Ảnh xem trước và ảnh chụp mới sẽ không hiển thị chữ ghi chú, vị trí hay thời
                  gian. Bạn vẫn có thể bật lại bất cứ lúc nào khi cần chụp ảnh công việc.
                </p>
                <button
                  type="button"
                  onClick={() => toggleNoteMode(true)}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap"
                >
                  Bật lại chế độ ghi chú
                </button>
              </div>
            ) : (
              <>
            {/* Note Editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="photo-note-input"
                  className="text-sm font-semibold text-slate-900"
                >
                  Nội dung ghi chú trên ảnh
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {note.length} ký tự
                </span>
              </div>
              <textarea
                id="photo-note-input"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Nghiệm thu hệ thống điện tầng 3, kiểm tra xong..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />

              {/* Quick note presets */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {QUICK_NOTES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNote(preset)}
                    className={`min-h-[34px] px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      note === preset
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Font & Typography Controls for Note */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    Kiểu chữ & định dạng ghi chú
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={noteTypography.bold}
                      onClick={() =>
                        updateNoteTypography({ bold: !noteTypography.bold })
                      }
                      className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                        noteTypography.bold
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5" />
                      <span>Đậm</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={noteTypography.italic}
                      onClick={() =>
                        updateNoteTypography({ italic: !noteTypography.italic })
                      }
                      className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-medium italic rounded-lg border transition-colors whitespace-nowrap ${
                        noteTypography.italic
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Italic className="w-3.5 h-3.5" />
                      <span>Nghiêng</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {FONT_OPTIONS.map((font) => {
                    const active = noteTypography.fontFamily === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          updateNoteTypography({ fontFamily: font.id })
                        }
                        className={`min-h-[40px] px-1.5 py-1.5 rounded-lg text-center transition-colors flex flex-col items-center justify-center ${
                          active
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span
                          className={`text-sm leading-none ${font.previewClass} ${
                            noteTypography.bold ? 'font-bold' : 'font-normal'
                          } ${noteTypography.italic ? 'italic' : ''}`}
                        >
                          Aa
                        </span>
                        <span className="text-[11px] font-medium mt-1 whitespace-nowrap">
                          {font.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Font Size Slider */}
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="note-size-slider"
                      className="text-xs font-medium text-slate-700"
                    >
                      Cỡ chữ ghi chú
                    </label>
                    <div className="flex items-center gap-2">
                      {(noteTypography.sizeScale ?? 1) !== 1 && (
                        <button
                          type="button"
                          onClick={() => updateNoteTypography({ sizeScale: 1 })}
                          className="text-[11px] font-medium text-orange-700 hover:underline whitespace-nowrap"
                        >
                          Mặc định
                        </button>
                      )}
                      <span className="text-xs font-mono text-slate-700 tabular-nums">
                        {Math.round((noteTypography.sizeScale ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 min-h-[36px]">
                    <span className="text-[11px] text-slate-400 font-medium select-none">
                      Nhỏ
                    </span>
                    <input
                      id="note-size-slider"
                      type="range"
                      min={60}
                      max={180}
                      step={5}
                      value={Math.round((noteTypography.sizeScale ?? 1) * 100)}
                      onChange={(e) =>
                        updateNoteTypography({
                          sizeScale: Number(e.target.value) / 100,
                        })
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <span className="text-xs text-slate-500 font-semibold select-none">
                      Lớn
                    </span>
                  </div>
                </div>

                {/* Overlay Opacity Slider */}
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="note-opacity-slider"
                      className="text-xs font-medium text-slate-700"
                    >
                      Độ mờ lớp phủ chữ
                    </label>
                    <div className="flex items-center gap-2">
                      {(noteTypography.opacity ?? 1) !== 1 && (
                        <button
                          type="button"
                          onClick={() => updateNoteTypography({ opacity: 1 })}
                          className="text-[11px] font-medium text-orange-700 hover:underline whitespace-nowrap"
                        >
                          Mặc định
                        </button>
                      )}
                      <span className="text-xs font-mono text-slate-700 tabular-nums">
                        {Math.round((noteTypography.opacity ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 min-h-[36px]">
                    <span className="text-[11px] text-slate-400 font-medium select-none whitespace-nowrap">
                      Mờ
                    </span>
                    <input
                      id="note-opacity-slider"
                      type="range"
                      min={15}
                      max={100}
                      step={5}
                      value={Math.round((noteTypography.opacity ?? 1) * 100)}
                      onChange={(e) =>
                        updateNoteTypography({
                          opacity: Number(e.target.value) / 100,
                        })
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <span className="text-xs text-slate-500 font-semibold select-none whitespace-nowrap">
                      Rõ nét
                    </span>
                  </div>
                </div>

                {/* Color Picker Bar for Note Contrast */}
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      Màu chữ ghi chú
                    </span>
                    <span className="text-xs font-mono text-slate-500 uppercase tabular-nums">
                      {noteTypography.color || '#FFFFFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLOR_PRESETS.map((preset) => {
                        const active =
                          (noteTypography.color || '#FFFFFF').toUpperCase() ===
                          preset.hex.toUpperCase();
                        return (
                          <button
                            key={preset.hex}
                            type="button"
                            title={preset.label}
                            aria-label={`Chọn màu chữ ${preset.label}`}
                            aria-pressed={active}
                            onClick={() =>
                              updateNoteTypography({ color: preset.hex })
                            }
                            className={`w-9 h-9 rounded-full border transition-transform flex items-center justify-center ${
                              preset.swatchClass
                            } ${
                              active
                                ? 'ring-2 ring-orange-600 ring-offset-2 scale-105'
                                : 'hover:scale-105'
                            }`}
                          >
                            {active && (
                              <Check
                                className={`w-4 h-4 ${
                                  preset.hex === '#0F172A'
                                    ? 'text-white'
                                    : 'text-slate-900'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <label className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0">
                      <input
                        type="color"
                        aria-label="Chọn màu chữ tùy chỉnh"
                        value={noteTypography.color || '#FFFFFF'}
                        onChange={(e) =>
                          updateNoteTypography({
                            color: e.target.value.toUpperCase(),
                          })
                        }
                        className="w-5 h-5 rounded border-0 bg-transparent p-0 cursor-pointer"
                      />
                      <span>Màu khác</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Inline Real-Time Mini Preview (visible when scrolled down on smaller screens) */}
            <div className="lg:hidden pt-4 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800">
                    Xem trước nhanh (thời gian thực)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileMiniPreview((prev) => !prev)}
                  className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                >
                  {showMobileMiniPreview ? 'Thu gọn' : 'Mở xem trước'}
                </button>
              </div>
              {showMobileMiniPreview && (
                <div className="bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center">
                  <canvas
                    ref={miniPreviewCanvasRef}
                    className="max-w-full max-h-[220px] w-auto h-auto object-contain"
                  />
                </div>
              )}
            </div>

            {/* Auto Location & Timestamp */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Vị trí & Thời gian tự động
                </h3>
                <button
                  type="button"
                  onClick={fetchCurrentGps}
                  disabled={isLocating}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <LocateFixed
                    className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`}
                  />
                  {isLocating ? 'Đang định vị...' : 'Lấy GPS hiện tại'}
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label
                    htmlFor="location-input"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Địa điểm hiển thị
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="location-input"
                      type="text"
                      value={locationText}
                      onChange={(e) => setLocationText(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="timestamp-input"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Thời gian chụp
                    </label>
                    <div className="relative flex items-center">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3" />
                      <input
                        id="timestamp-input"
                        type="text"
                        value={timestamp}
                        onChange={(e) => setTimestamp(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-slate-300 pl-8 pr-8 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => applyCaptureDate(new Date())}
                        title="Cập nhật giờ hiện tại"
                        className="absolute right-2 p-1 text-slate-400 hover:text-slate-700"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="coords-input"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Tọa độ GPS
                    </label>
                    <input
                      id="coords-input"
                      type="text"
                      value={coordinates}
                      onChange={(e) => setCoordinates(e.target.value)}
                      placeholder={
                        coordFormat === 'hidden'
                          ? 'Đang ẩn tọa độ trên ảnh'
                          : 'Ví dụ: 10.77689° N, 106.70090° E'
                      }
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {/* Timestamp Display Format Selector */}
                <div className="pt-1 space-y-1.5">
                  <span className="block text-xs font-medium text-slate-600">
                    Định dạng hiển thị thời gian
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIMESTAMP_FORMAT_OPTIONS.map((opt) => {
                      const active = timestampFormat === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateTimestampFormat(opt.id)}
                          className={`min-h-[34px] px-2.5 py-1 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900 font-medium'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* GPS Coordinate Display Format Selector */}
                <div className="pt-1 space-y-1.5">
                  <span className="block text-xs font-medium text-slate-600">
                    Định dạng tọa độ GPS
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {COORD_FORMAT_OPTIONS.map((opt) => {
                      const active = coordFormat === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateCoordFormat(opt.id)}
                          className={`min-h-[34px] px-2.5 py-1 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900 font-medium'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {locationStatus && (
                  <p className="text-xs text-slate-600">{locationStatus}</p>
                )}
              </div>
            </div>

            {/* Stamp Style & Position Selectors */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div>
                <span className="block text-sm font-semibold text-slate-900 mb-2">
                  Kiểu hiển thị trên ảnh
                </span>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'transparent-split', label: 'Trong suốt 2 cột' },
                      { id: 'field-overlay', label: 'Đổ bóng nhẹ' },
                      { id: 'minimal-corner', label: 'Gọn 1 khối' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setStampStyle(item.id)}
                      className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        stampStyle === item.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-sm font-semibold text-slate-900 mb-2">
                  Vị trí hiển thị ghi chú
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {POSITION_OPTIONS.map((pos) => {
                    const active = notePosition === pos.id;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateNotePosition(pos.id)}
                        className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pos.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
              </>
            )}
          </div>

          {/* Primary Export CTA */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <button
              type="button"
              onClick={() => handleExportAndSave()}
              disabled={isSaving}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 active:scale-[0.99] rounded-xl transition-all disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Đang xử lý ảnh...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {isNoteModeEnabled
                    ? 'Lưu & Tải ảnh đã gắn ghi chú'
                    : 'Tải ảnh gốc (không ghi chú)'}
                </>
              )}
            </button>

            {saveFeedback && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Check className="w-4 h-4 shrink-0" />
                <span>{saveFeedback}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Saved History Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Lịch sử ảnh đã gắn ghi chú
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lưu tạm trên thiết bị để xem lại nhanh nội dung và địa điểm đã xuất
            </p>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => persistHistory([])}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Xóa lịch sử
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl py-8 px-4 text-center">
            <p className="text-sm text-slate-600">
              Chưa có ảnh nào được xuất trong phiên làm việc này.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Chọn ảnh hoặc bấm &ldquo;Mô phỏng bật Add-in&rdquo; và lưu để kiểm tra kết quả.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {history.map((item) => (
              <article
                key={item.id}
                className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex flex-col justify-between"
              >
                <div className="aspect-[4/3] bg-slate-900 overflow-hidden">
                  <img
                    src={item.thumbnailDataUrl}
                    alt={item.note}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-900 line-clamp-2">
                    {item.note}
                  </p>
                  <p className="text-[11px] text-slate-600 truncate">
                    {item.locationText}
                  </p>
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70">
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {item.timestamp}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHistoryItem(item.id)}
                      aria-label="Xóa bản ghi"
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
