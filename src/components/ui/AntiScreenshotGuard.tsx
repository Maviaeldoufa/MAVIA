import { ShieldAlert, ShieldBan, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface BlockAlertState {
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
}

const DEFAULT_SCREENSHOT_ALERT: BlockAlertState = {
  titleAr: 'ممنوع أخذ لقطة شاشة!',
  titleEn: 'Screenshots Are Forbidden!',
  messageAr:
    'ممنوع تماماً التقاط لقطات شاشة أو تصوير المحتوى من داخل منصة MAVIA حفاظاً على حقوق المحتوى والاختبارات.',
  messageEn:
    'Taking screenshots or capturing content inside the MAVIA platform is strictly prohibited.',
};

export function AntiScreenshotGuard() {
  const { user } = useAuth();
  const { tr } = useLanguage();

  const [explicitBlock, setExplicitBlock] = useState<BlockAlertState | null>(null);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const lastCaptureComboAtRef = useRef<number>(0);
  const explicitBlockRef = useRef<BlockAlertState | null>(null);

  explicitBlockRef.current = explicitBlock;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 3200);
  }, []);

  const triggerScreenshotBlock = useCallback((custom?: Partial<BlockAlertState>) => {
    const nextAlert = {
      ...DEFAULT_SCREENSHOT_ALERT,
      ...custom,
    };
    explicitBlockRef.current = nextAlert;
    setPrivacyShield(true);
    setExplicitBlock(nextAlert);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText('ممنوع أخذ لقطة شاشة من داخل منصة MAVIA')
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const code = (e.code || '').toLowerCase();

      // PrintScreen (both keydown & keyup)
      if (key === 'printscreen' || code === 'printscreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock();
        return;
      }

      // Track OS/Meta+Shift modifier combos (Win+Shift+S, Cmd+Shift+3/4/5/6)
      if ((e.metaKey || key === 'meta' || key === 'os') && e.shiftKey) {
        lastCaptureComboAtRef.current = Date.now();
        setPrivacyShield(true);
        if (['s', 'r', '3', '4', '5', '6'].includes(key)) {
          e.preventDefault();
          e.stopPropagation();
          triggerScreenshotBlock();
        }
        return;
      }

      // Ctrl/Cmd + P (Print / Save PDF)
      if ((e.ctrlKey || e.metaKey) && key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock({
          titleAr: 'ممنوع الطباعة أو الحفظ كـ PDF!',
          titleEn: 'Printing & PDF Capture Forbidden!',
          messageAr:
            'ممنوع طباعة صفحات المنصة أو تصديرها كصورة أو ملف PDF لحماية المواد التعليمية.',
          messageEn:
            'Printing or exporting platform screens to PDF/images is strictly forbidden.',
        });
        return;
      }

      // Ctrl/Cmd + S (Save page)
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock({
          titleAr: 'ممنوع حفظ الصفحة!',
          titleEn: 'Saving Page Forbidden!',
          messageAr: 'ممنوع حفظ أو تنزيل واجهات المنصة.',
          messageEn: 'Saving or downloading platform pages is forbidden.',
        });
        return;
      }

      // F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C / Ctrl+U
      const isDevToolsShortcut =
        key === 'f12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['i', 'j', 'c'].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && key === 'u');

      if (isDevToolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock({
          titleAr: 'ممنوع!',
          titleEn: 'Forbidden!',
          messageAr:
            'ممنوع فتح أدوات الفحص أو نسخ محتوى المنصة أو أخذ لقطة شاشة.',
          messageEn:
            'Opening inspection tools, copying content, or taking screenshots is strictly forbidden.',
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const code = (e.code || '').toLowerCase();
      if (key === 'printscreen' || code === 'printscreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock();
      }
    };

    const handleBlur = () => {
      setPrivacyShield(true);
      if (Date.now() - lastCaptureComboAtRef.current < 1800) {
        triggerScreenshotBlock();
      }
    };

    const handleFocus = () => {
      if (!explicitBlockRef.current) {
        setPrivacyShield(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setPrivacyShield(true);
        if (Date.now() - lastCaptureComboAtRef.current < 1800) {
          triggerScreenshotBlock();
        }
      } else if (!explicitBlockRef.current && document.hasFocus()) {
        setPrivacyShield(false);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      showToast(
        tr(
          'ممنوع! لا يُسمح بأخذ لقطات شاشة أو نسخ محتوى المنصة.',
          'Forbidden! Screenshots and content copying are not allowed.'
        )
      );
    };

    const handleDragStart = (e: DragEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    };

    const handleBeforePrint = () => {
      triggerScreenshotBlock({
        titleAr: 'ممنوع الطباعة!',
        titleEn: 'Printing Forbidden!',
        messageAr: 'ممنوع طباعة أو تصوير محتوى منصة MAVIA.',
        messageEn: 'Printing or capturing MAVIA content is forbidden.',
      });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeprint', handleBeforePrint);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);

    // Block in-browser screen capture API (getDisplayMedia)
    let restoreDisplayMedia: (() => void) | null = null;
    try {
      const mediaDevices = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
      };
      if (mediaDevices && typeof mediaDevices.getDisplayMedia === 'function') {
        const originalGetDisplayMedia = mediaDevices.getDisplayMedia.bind(mediaDevices);
        mediaDevices.getDisplayMedia = async () => {
          triggerScreenshotBlock({
            titleAr: 'ممنوع تسجيل أو مشاركة الشاشة!',
            titleEn: 'Screen Recording Forbidden!',
            messageAr: 'ممنوع تسجيل أو التقاط شاشة منصة MAVIA.',
            messageEn: 'Recording or capturing the MAVIA screen is forbidden.',
          });
          throw new DOMException('Screen capture is forbidden on MAVIA.', 'NotAllowedError');
        };
        restoreDisplayMedia = () => {
          mediaDevices.getDisplayMedia = originalGetDisplayMedia;
        };
      }
    } catch {
      // Ignore read-only mediaDevices implementations
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      restoreDisplayMedia?.();
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [showToast, tr, triggerScreenshotBlock]);

  const dismissBlock = () => {
    explicitBlockRef.current = null;
    setExplicitBlock(null);
    setPrivacyShield(false);
  };

  return (
    <>
      {/* Subtle non-intrusive user watermark across the workspace */}
      {user && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-20 overflow-hidden select-none opacity-[0.035]"
        >
          <div className="w-[150%] h-[150%] -translate-x-1/6 -translate-y-1/6 -rotate-24 grid grid-cols-3 gap-16 place-items-center text-[11px] font-mono tracking-widest text-[#F5D061]">
            {Array.from({ length: 12 }).map((_, idx) => (
              <span key={idx} className="whitespace-nowrap">
                MAVIA · {user.name} · {user.id.slice(-8)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Floating Forbidden Toast (e.g., on right-click attempt) */}
      {toastMsg && !explicitBlock && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[120] max-w-md w-[92vw] rounded-xl bg-red-950/95 border border-red-500/60 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.85)] flex items-center gap-3 text-red-100"
        >
          <ShieldBan className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-xs sm:text-sm font-semibold leading-snug flex-1">{toastMsg}</p>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-red-300 hover:text-white p-1 cursor-pointer"
            aria-label={tr('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Instant Blackout Shield / Explicit Forbidden Modal */}
      {(privacyShield || explicitBlock) && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          className="fixed inset-0 z-[200] bg-[#050507]/98 backdrop-blur-2xl flex items-center justify-center p-4 select-none"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#121216] border border-red-500/50 p-6 sm:p-8 text-center space-y-5 shadow-[0_24px_90px_rgba(0,0,0,0.9)]">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/50 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold tracking-wide">
                {tr('ممنوع', 'FORBIDDEN')}
              </span>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5F0E6]">
                {explicitBlock
                  ? tr(explicitBlock.titleAr, explicitBlock.titleEn)
                  : tr('ممنوع أخذ لقطة شاشة!', 'Screenshots Are Forbidden!')}
              </h2>
              <p className="text-sm text-[#C8C2B8] leading-relaxed">
                {explicitBlock
                  ? tr(explicitBlock.messageAr, explicitBlock.messageEn)
                  : tr(
                      'تم إخفاء محتوى منصة MAVIA لحمايته — ممنوع التقاط لقطات الشاشة أو التصوير من داخل المنصة.',
                      'MAVIA platform content is hidden for protection — taking screenshots inside the platform is forbidden.'
                    )}
              </p>
            </div>

            {explicitBlock ? (
              <button
                type="button"
                onClick={dismissBlock}
                className="w-full py-2.5 px-5 rounded-xl bg-[#D4AF37] text-[#09090B] font-bold text-sm hover:bg-[#E5C158] transition-colors cursor-pointer"
              >
                {tr('فهمت، العودة للمنصة', 'Understood, Return to Platform')}
              </button>
            ) : (
              <p className="text-xs text-[#A8A29E]">
                {tr(
                  'سيظهر المحتوى تلقائياً فور عودة التركيز إلى نافذة المنصة.',
                  'Content will automatically reappear once focus returns to the platform window.'
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
