import React, { useState } from 'react';
import { CheckCircle2, Circle, Info, ShieldCheck, Smartphone } from 'lucide-react';

interface ChecklistItem {
  id: string;
  title: string;
  path: string;
  why: string;
}

const HYPEROS_CHECKLIST: ChecklistItem[] = [
  {
    id: 'autostart',
    title: 'Bật Tự khởi chạy (Autostart)',
    path: 'Cài đặt -> Ứng dụng -> Quản lý ứng dụng -> Ghi chú Camera Add-in -> Tự khởi chạy',
    why: 'MIUI/HyperOS mặc định tắt mọi dịch vụ nền khi bạn vuốt đa nhiệm hoặc khóa màn hình.',
  },
  {
    id: 'popup_bg',
    title: 'Cho phép hiển thị cửa sổ pop-up khi chạy trong nền',
    path: 'Thông tin ứng dụng -> Quyền khác -> Hiển thị cửa sổ pop-up khi chạy trong nền (Luôn cho phép)',
    why: 'Đây là quyền riêng của Xiaomi. Nếu thiếu quyền này, bảng ghi chú sẽ không bật được đè lên Camera gốc.',
  },
  {
    id: 'overlay',
    title: 'Hiển thị trên ứng dụng khác (SYSTEM_ALERT_WINDOW)',
    path: 'Cài đặt -> Bảo vệ quyền riêng tư -> Quyền đặc biệt -> Hiển thị trên các ứng dụng khác',
    why: 'Cho phép khung ghi chú nổi trượt từ cạnh dưới lên ngay khi bạn đang ở trong màn hình chụp ảnh.',
  },
  {
    id: 'battery',
    title: 'Tắt tối ưu hóa pin (Không hạn chế)',
    path: 'Thông tin ứng dụng -> Tiết kiệm pin -> Chọn "Không hạn chế"',
    why: 'Đảm bảo ContentObserver không bị ngủ đông khi bạn đi khảo sát ngoài trời và chụp ảnh liên tục.',
  },
];

const CHECKLIST_STORAGE_KEY = 'camnote_hyperos_checks_v1';

export default function HyperOSGuide() {
  const [checkedIds, setCheckedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const toggleItem = (id: string) => {
    const next = checkedIds.includes(id)
      ? checkedIds.filter((x) => x !== id)
      : [...checkedIds, id];
    setCheckedIds(next);
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  };

  return (
    <div className="space-y-6">
      {/* Technical Reality & Comparison */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Lưu ý kỹ thuật thực tế về Camera mặc định trên Xiaomi HyperOS / MIUI
            </h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Trên Android (MIUI 14 / HyperOS), ứng dụng Camera của Xiaomi được ký bằng chứng chỉ
              hệ thống và không hỗ trợ cài add-in trực tiếp vào bên trong giao diện kính ngắm trừ
              khi máy đã Unlock Bootloader & Root (dùng LSPosed). Tuy nhiên, bạn có 3 phương án
              thực tế sau tùy nhu cầu sử dụng:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="border border-orange-200 bg-orange-50/40 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-orange-700">
              Phương án 1 · Khuyên dùng (Không Root)
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Dịch vụ nền bắt DCIM/Camera + Bảng nổi
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Biên dịch mã nguồn Kotlin ở tab bên cạnh thành file APK. Bạn vẫn chụp bằng Camera
              gốc Xiaomi bình thường; ngay khi ảnh lưu xong (~0.4 giây), bảng ghi chú tự bật
              lên kèm GPS & thời gian.
            </p>
          </div>

          <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500">
              Phương án 2 · Dùng ngay không cần cài APK
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Thẻ &ldquo;Thử nghiệm & Đóng dấu&rdquo; trên trình duyệt
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Thêm trang web này ra màn hình chính Chrome trên điện thoại. Chụp xong ở
              Camera gốc, chuyển sang chọn ảnh vừa chụp: công cụ tự đọc EXIF GPS + giờ chụp và
              đóng dấu ngay.
            </p>
          </div>

          <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500">
              Phương án 3 · Chỉ dành cho máy đã Root
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              Hook trực tiếp com.android.camera (LSPosed)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Can thiệp thẳng vào hàm lưu ảnh của Camera Xiaomi thông qua Magisk + LSPosed. Không
              khuyên dùng cho máy chính vì có thể lỗi ứng dụng ngân hàng và mất cập nhật OTA.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive HyperOS Permission Checklist */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-slate-800 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                4 quyền bắt buộc phải bật trên MIUI 14 / HyperOS
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đánh dấu các mục đã bật trên điện thoại để dịch vụ Add-in hoạt động ổn định
              </p>
            </div>
          </div>

          <div className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
            Đã hoàn thành: {checkedIds.length}/{HYPEROS_CHECKLIST.length}
          </div>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {HYPEROS_CHECKLIST.map((item) => {
            const done = checkedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`w-full text-left p-4 flex items-start gap-3 transition-colors ${
                  done ? 'bg-emerald-50/40' : 'bg-white hover:bg-slate-50'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 mt-0.5 shrink-0" />
                )}
                <div className="space-y-1">
                  <div
                    className={`text-sm font-semibold ${
                      done ? 'text-emerald-950 line-through' : 'text-slate-900'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="text-xs font-mono text-slate-600">{item.path}</div>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.why}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Share Sheet fallback tip */}
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <Smartphone className="w-5 h-5 text-slate-700 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-900">Mẹo sử dụng nhanh trên Camera Xiaomi:</span>{' '}
            Nếu bạn tắt chế độ bật tự động khi chụp ảnh cá nhân, tệp{' '}
            <span className="font-mono text-slate-800">AndroidManifest.xml</span> ở tab Mã nguồn
            đã khai báo sẵn bộ lọc <span className="font-mono text-slate-800">ACTION_SEND</span>.
            Bạn chỉ cần bấm vào ảnh thu nhỏ góc dưới Camera → chọn <strong>Chia sẻ → Ghi chú Camera Add-in</strong>{' '}
            để điền ghi chú cho riêng bức ảnh đó.
          </div>
        </div>
      </section>
    </div>
  );
}
