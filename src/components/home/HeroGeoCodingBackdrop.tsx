import { useEffect, useState } from 'react';
import heroGeospatialCodeImg from '../../assets/images/hero_geospatial_code_1794935029804.jpg';
import heroGisTopographyImg from '../../assets/images/hero_gis_topography_1794935029904.jpg';
import heroSatelliteGisImg from '../../assets/images/hero_satellite_gis_1794935029733.jpg';

interface HeroSlide {
  id: string;
  src: string;
  motionClass: string;
  objectPosition: string;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'satellite-gis',
    src: heroSatelliteGisImg,
    motionClass: 'mvia-hero-pan-a',
    objectPosition: 'center center',
  },
  {
    id: 'gis-topography',
    src: heroGisTopographyImg,
    motionClass: 'mvia-hero-pan-b',
    objectPosition: 'center center',
  },
  {
    id: 'geospatial-code',
    src: heroGeospatialCodeImg,
    motionClass: 'mvia-hero-pan-c',
    objectPosition: 'center center',
  },
];

const SLIDE_INTERVAL_MS = 5200;

export function HeroGeoCodingBackdrop() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedSlides, setFailedSlides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none bg-[#121216]"
    >
      {/* Fallback obsidian & warm gold mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_35%,rgba(212,175,55,0.16)_0%,rgba(18,18,22,0.92)_68%)]" />

      {/* Animated Satellite · GIS · Programming Imagery Layers */}
      {HERO_SLIDES.map((slide, index) => {
        if (failedSlides[slide.id]) return null;
        const isActive = index === activeIndex;

        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
              isActive ? 'opacity-70' : 'opacity-0'
            }`}
          >
            <img
              src={slide.src}
              alt=""
              referrerPolicy="no-referrer"
              loading={index === 0 ? 'eager' : 'lazy'}
              onError={() =>
                setFailedSlides((prev) => ({
                  ...prev,
                  [slide.id]: true,
                }))
              }
              className={`h-full w-full object-cover ${slide.motionClass}`}
              style={{ objectPosition: slide.objectPosition }}
            />
          </div>
        );
      })}

      {/* Subtle Orbital Telemetry & GIS Vector Overlay */}
      <svg
        viewBox="0 0 900 560"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 h-full w-full opacity-35"
      >
        <defs>
          <pattern id="mviaHeroGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" stroke="#D4AF37" strokeOpacity="0.16" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="900" height="560" fill="url(#mviaHeroGrid)" />

        <g className="mvia-orbit-spin" style={{ transformOrigin: '240px 210px' }}>
          <circle
            cx="240"
            cy="210"
            r="165"
            stroke="#D4AF37"
            strokeOpacity="0.32"
            strokeWidth="1"
            strokeDasharray="6 8"
          />
          <circle cx="405" cy="210" r="4" fill="#F5D061" fillOpacity="0.85" />
          <circle cx="75" cy="210" r="2.5" fill="#D4AF37" fillOpacity="0.65" />
        </g>

        <g className="mvia-orbit-spin" style={{ transformOrigin: '240px 210px', animationDirection: 'reverse' }}>
          <circle
            cx="240"
            cy="210"
            r="112"
            stroke="#E5C158"
            strokeOpacity="0.24"
            strokeWidth="0.9"
            strokeDasharray="3 7"
          />
        </g>
      </svg>

      {/* Measured contrast scrim so Arabic & English typography stays crisp (>= 7:1 contrast) */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#121216]/90 via-[#121216]/58 to-[#121216]/70" />
      <div className="absolute inset-0 bg-gradient-to-l from-[#121216]/85 via-[#121216]/52 to-[#121216]/30" />
    </div>
  );
}
