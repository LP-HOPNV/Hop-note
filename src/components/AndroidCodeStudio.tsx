import React, { useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { ANDROID_ADDIN_FILES, AndroidSourceFile } from '../data/androidAddinCode';

export default function AndroidCodeStudio() {
  const [selectedId, setSelectedId] = useState<string>(ANDROID_ADDIN_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile: AndroidSourceFile =
    ANDROID_ADDIN_FILES.find((f) => f.id === selectedId) || ANDROID_ADDIN_FILES[0];

  const handleCopy = async (file: AndroidSourceFile) => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleDownloadFile = (file: AndroidSourceFile) => {
    const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Architecture Pipeline Summary */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Kiến trúc Add-in chạy song song cùng Camera gốc Xiaomi
        </h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Ứng dụng Camera mặc định của Xiaomi (com.android.camera) là phần mềm hệ thống đóng,
          không mở API plugin cho bên thứ ba trên máy chưa Root. Cách chuẩn nhất để biến thành
          tính năng bổ sung liền mạch là chạy dịch vụ nền bắt sự kiện lưu ảnh vào{' '}
          <span className="font-mono text-xs text-slate-800">DCIM/Camera</span> và bật cửa sổ
          ghi chú nổi ngay phía trên Camera.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          {[
            {
              step: '01. Chụp bằng Camera gốc',
              detail: 'Bạn vẫn mở app Camera Xiaomi, dùng đủ ống kính 50MP OIS và chế độ AI như bình thường.',
            },
            {
              step: '02. Bắt sự kiện tức thì',
              detail: 'ContentObserver lọc đúng thư mục DCIM/Camera và chờ IS_PENDING = 0 để tránh đọc file nháp.',
            },
            {
              step: '03. Bật bảng ghi chú nổi',
              detail: 'WindowManager hiện khung nhập ghi chú ngay trên màn hình kèm giờ & địa chỉ GPS tự động.',
            },
            {
              step: '04. Ghi đè EXIF & Xuất ảnh',
              detail: 'PhotoStampEngine vẽ nhãn lên ảnh hoặc nhúng vào EXIF UserComment rồi lưu vào Thư viện.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3.5"
            >
              <div className="text-xs font-semibold text-slate-900">{item.step}</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Code Explorer + Viewer */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* File List Sidebar */}
        <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">
            Tệp dự án Android (Kotlin)
          </div>
          {ANDROID_ADDIN_FILES.map((file) => {
            const isActive = file.id === activeFile.id;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedId(file.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-start gap-2.5 min-h-[44px] ${
                  isActive
                    ? 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileCode2
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-orange-600' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold font-mono truncate">
                    {file.filename}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                    {file.summary}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Source Code Pane */}
        <div className="lg:col-span-8 flex flex-col min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
            <div className="min-w-0">
              <div className="text-xs font-mono font-semibold text-slate-900 truncate">
                {activeFile.path}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{activeFile.summary}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(activeFile)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedId === activeFile.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Đã sao chép
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Sao chép mã
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadFile(activeFile)}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Tải tệp
              </button>
            </div>
          </div>

          <div className="bg-slate-950 text-slate-100 p-4 overflow-x-auto max-h-[540px]">
            <pre className="text-xs font-mono leading-relaxed whitespace-pre">
              <code>{activeFile.code}</code>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
