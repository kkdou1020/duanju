import React, { useState, useEffect, useRef } from 'react';
import { useAssetUrl } from '@/features/useAssetUrl';
import { Image as ImageIcon, Film } from 'lucide-react';

interface LazyMediaProps {
  assetId?: string;
  fallbackUrl?: string; // Direct URL (e.g. newly generated base64)
  type: 'image' | 'video';
  alt?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
  controls?: boolean;
  onError?: (error: any) => void;
}

const useInView = (options: IntersectionObserverInit) => {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, options);

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [ref, options.root, options.rootMargin, options.threshold]);

  return [ref, isInView] as const;
};

export const LazyMedia: React.FC<LazyMediaProps> = ({
  assetId,
  fallbackUrl,
  type,
  alt,
  className,
  imgClassName,
  onClick,
  controls,
  onError
}) => {
  // Use a large rootMargin to preload when close to viewport
  const [ref, isInView] = useInView({ rootMargin: '200px' });

  // Only try to load the asset URL if we are in view or have a direct fallback
  // If we have a fallbackUrl (e.g. base64), we load it immediately regardless of view (usually it's small or user just generated it)
  // But for assetId (blob), we wait for view.
  const shouldLoad = isInView || !!fallbackUrl;

  const { url, loading } = useAssetUrl(shouldLoad ? assetId : undefined, fallbackUrl);

  // Optimization: Only render the heavy media element if in view, 
  // even if we have the URL loaded (unless it's a small fallback we want to show eagerly, but here we prioritize performance)
  const showContent = isInView;

  return (
    <div ref={ref} className={`relative overflow-hidden bg-black/20 flex items-center justify-center ${className}`} onClick={onClick}>
      {!showContent ? (
        // Placeholder when out of view
        <div className="text-gray-600 flex flex-col items-center gap-2">
          {type === 'image' ? <ImageIcon className="w-6 h-6 opacity-20" /> : <Film className="w-6 h-6 opacity-20" />}
        </div>
      ) : (
        <>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            </div>
          )}

          {url ? (
            type === 'image' ? (
              <img src={url} alt={alt} className={imgClassName || "w-full h-full object-contain"} onError={onError} />
            ) : (
              <video src={url} controls={controls} className={imgClassName || "w-full h-full object-contain"} onError={onError} />
            )
          ) : (
            !loading && (
              <div className="text-gray-500 text-xs">
                {type === 'image' ? 'No Image' : 'No Video'}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};
