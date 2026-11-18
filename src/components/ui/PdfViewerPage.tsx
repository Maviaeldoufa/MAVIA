import {
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { resolveApiUrl } from '../../utils/api';
import { AntiScreenshotGuard } from './AntiScreenshotGuard';
import { MviaBrandMark } from './MviaBrandMark';

export interface StandalonePdfTarget {
  fileUrl: string;
  title?: string;
  downloadName?: string;
}

export function isSafePdfViewerUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isPdfAsset(url?: string, fileName?: string): boolean {
  const target = `${url || ''} ${fileName || ''}`.toLowerCase();
  return target.includes('.pdf');
}

export function buildPdfViewerHref(
  fileUrl: string,
  title?: string,
  downloadName?: string
): string {
  const params = new URLSearchParams();
  params.set('view', 'pdf');
  params.set('file', fileUrl);
  if (title?.trim()) {
    params.set('title', title.trim());
  }
  if (downloadName?.trim()) {
    params.set('name', downloadName.trim());
  }
  if (typeof window === 'undefined') {
    return `/?${params.toString()}`;
  }
  return `${window.location.origin}/?${params.toString()}`;
}

export function getPdfTargetFromLocation(): StandalonePdfTarget | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') !== 'pdf') return null;
  const fileUrl = params.get('file')?.trim() || '';
  if (!isSafePdfViewerUrl(fileUrl)) return null;
  return {
    fileUrl,
    title: params.get('title')?.trim() || undefined,
    downloadName: params.get('name')?.trim() || undefined,
  };
}

interface PdfViewerPageProps {
  fileUrl: string;
  title?: string;
  downloadName?: string;
  onBack: () => void;
}

export function PdfViewerPage({
  fileUrl,
  title,
  downloadName,
  onBack,
}: PdfViewerPageProps) {
  const { tr, isEn } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  const resolvedUrl = resolveApiUrl(fileUrl);
  const displayTitle = title || downloadName || tr('معاينة ملف PDF', 'PDF Preview');

  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${displayTitle} | MAVIA`;
    return () => {
      document.title = prevTitle;
    };
  }, [displayTitle]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
      } catch {
        // Ignore if blocked by browser/iframe permissions
      }
    } else if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen h-screen w-full bg-[#F6F4EF] dark:bg-[#09090B] text-[#141418] dark:text-[#F7F3EB] flex flex-col overflow-hidden mvia-protected transition-colors duration-200"
    >
      <AntiScreenshotGuard />

      {/* Top Standalone PDF Viewer Header */}
      <header className="shrink-0 bg-white dark:bg-[#121216] border-b border-black/10 dark:border-[#D4AF37]/30 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F2EA] dark:bg-[#18181D] border border-black/15 dark:border-white/15 text-xs font-semibold text-[#141418] dark:text-[#F7F3EB] hover:border-[#D4AF37]/60 hover:text-[#735303] dark:hover:text-[#F5D061] transition-colors cursor-pointer shrink-0"
          >
            {isEn ? (
              <ArrowLeft className="w-3.5 h-3.5" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
            <span>{tr('العودة للمنصة', 'Back to Platform')}</span>
          </button>

          <div className="hidden sm:flex items-center shrink-0">
            <MviaBrandMark size="sm" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#B8860B] dark:text-[#D4AF37] shrink-0" />
            <h1 className="font-display text-sm sm:text-base font-bold text-[#735303] dark:text-[#F5D061] truncate">
              {displayTitle}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F2EA] dark:bg-[#18181D] border border-black/15 dark:border-white/15 text-xs font-semibold text-[#141418] dark:text-[#F7F3EB] hover:border-[#D4AF37]/60 hover:text-[#735303] dark:hover:text-[#F5D061] transition-colors cursor-pointer"
          >
            {isNativeFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {tr('إنهاء ملء الشاشة', 'Exit Fullscreen')}
                </span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {tr('ملء الشاشة', 'Fullscreen')}
                </span>
              </>
            )}
          </button>

          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-xs font-semibold text-[#735303] dark:text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{tr('فتح الملف مباشرة', 'Open Raw PDF')}</span>
          </a>

          <a
            href={resolvedUrl}
            download={downloadName || 'document.pdf'}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{tr('تحميل', 'Download')}</span>
          </a>
        </div>
      </header>

      {/* Main Dedicated PDF Viewport */}
      <main className="flex-1 min-h-0 flex flex-col bg-[#EAE6DC] dark:bg-[#141418]">
        <iframe
          src={resolvedUrl}
          title={displayTitle}
          allowFullScreen
          className="w-full flex-1 bg-white border-0"
        />
      </main>

      {/* Slim Mobile / Browser Fallback Bar */}
      <footer className="shrink-0 bg-[#EFECE4] dark:bg-[#0D0D10] border-t border-black/10 dark:border-white/10 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C5850] dark:text-[#C9C2B8]">
        <span>
          {tr(
            'وضع المعاينة المنفصلة لملفات PDF · منصة MAVIA',
            'Standalone PDF Reader · MAVIA Platform'
          )}
        </span>
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#856104] dark:text-[#F5D061] hover:underline font-semibold"
        >
          {tr(
            'إذا لم يظهر الملف على هاتفك، اضغط هنا للفتح المباشر',
            'Not displaying on mobile? Tap here to open directly'
          )}
        </a>
      </footer>
    </div>
  );
}
