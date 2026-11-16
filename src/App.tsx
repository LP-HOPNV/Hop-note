/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Camera, Code2, ShieldCheck } from 'lucide-react';
import AndroidCodeStudio from './components/AndroidCodeStudio';
import CameraAddinWorkbench from './components/CameraAddinWorkbench';
import HyperOSGuide from './components/HyperOSGuide';

type ActiveSection = 'workbench' | 'android-code' | 'hyperos-guide';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveSection>('workbench');
  const [pickPhotoTrigger, setPickPhotoTrigger] = useState<number>(0);

  const handleTopCta = () => {
    setActiveTab('workbench');
    setPickPhotoTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('workbench')}
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            Ghi chú Camera
          </button>

          {/* Zone 2: Clean single-line navigation links */}
          <nav
            aria-label="Điều hướng chính"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('workbench')}
              className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'workbench'
                  ? 'border-orange-600 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Thử nghiệm & Đóng dấu
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('android-code')}
              className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'android-code'
                  ? 'border-orange-600 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Mã nguồn Android
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hyperos-guide')}
              className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'hyperos-guide'
                  ? 'border-orange-600 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Cài đặt HyperOS
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleTopCta}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Chọn ảnh chụp
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12 space-y-6">
        {/* Contextual Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Add-in ghi chú nhanh kèm vị trí & thời gian sau khi chụp ảnh
            </h1>
          </div>
        </div>

        {/* Active View */}
        {activeTab === 'workbench' && (
          <CameraAddinWorkbench externalTriggerCount={pickPhotoTrigger} />
        )}
        {activeTab === 'android-code' && <AndroidCodeStudio />}
        {activeTab === 'hyperos-guide' && <HyperOSGuide />}
      </main>

      {/* Mobile Bottom Navigation (Only sticky bar on mobile: 56px < 8% viewport height) */}
      <nav
        aria-label="Điều hướng di động"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-3 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('workbench')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            activeTab === 'workbench' ? 'text-orange-600' : 'text-slate-500'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="whitespace-nowrap">Đóng dấu</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('android-code')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            activeTab === 'android-code' ? 'text-orange-600' : 'text-slate-500'
          }`}
        >
          <Code2 className="w-5 h-5" />
          <span className="whitespace-nowrap">Mã Android</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('hyperos-guide')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            activeTab === 'hyperos-guide' ? 'text-orange-600' : 'text-slate-500'
          }`}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="whitespace-nowrap">HyperOS</span>
        </button>
      </nav>
    </div>
  );
}
