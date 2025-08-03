/**
 * Safe HTML Component
 * React component for safely rendering HTML content with XSS protection
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { 
  xssProtection, 
  ContentType, 
  SanitizationOptions, 
  XSSDetectionResult,
  XSSThreatLevel,
  SafeHTMLProps 
} from '../../utils/xssProtection';

/**
 * SafeHTML Component
 * Safely renders HTML content with automatic XSS protection
 */
export const SafeHTML: React.FC<SafeHTMLProps> = ({
  content,
  contentType = ContentType.HTML,
  sanitizationOptions = {},
  onXSSDetected,
  fallbackContent = '',
  className,
  style,
}) => {
  const [detectionResult, setDetectionResult] = useState<XSSDetectionResult | null>(null);
  const [hasError, setHasError] = useState(false);

  // Sanitize content with XSS detection
  const { sanitizedContent, xssDetected } = useMemo(() => {
    try {
      setHasError(false);
      
      if (!content || typeof content !== 'string') {
        return { sanitizedContent: fallbackContent, xssDetected: null };
      }

      // Detect XSS in content
      const result = xssProtection.detectXSS(content, contentType);
      
      // Use sanitized content from detection result
      const sanitized = result.sanitizedContent || 
                       xssProtection.sanitizeContent(content, contentType, sanitizationOptions);

      return { 
        sanitizedContent: sanitized, 
        xssDetected: result.isXSS ? result : null 
      };
    } catch (error) {
      console.error('❌ SafeHTML content processing failed:', error);
      setHasError(true);
      return { sanitizedContent: fallbackContent, xssDetected: null };
    }
  }, [content, contentType, sanitizationOptions, fallbackContent]);

  // Handle XSS detection
  useEffect(() => {
    if (xssDetected) {
      setDetectionResult(xssDetected);
      
      // Call callback if provided
      if (onXSSDetected) {
        onXSSDetected(xssDetected);
      }

      // Log warning for medium+ threats
      if (xssDetected.threatLevel !== XSSThreatLevel.LOW) {
        console.warn('🚨 XSS detected in SafeHTML component:', {
          threatLevel: xssDetected.threatLevel,
          attackTypes: xssDetected.attackType,
          confidence: xssDetected.confidence,
        });
      }
    }
  }, [xssDetected, onXSSDetected]);

  // Error boundary for additional safety
  const renderContent = useCallback(() => {
    try {
      if (hasError) {
        return (
          <div 
            className={`safe-html-error ${className || ''}`}
            style={style}
            data-testid="safe-html-error"
          >
            <span>⚠️ Content could not be safely rendered</span>
          </div>
        );
      }

      // For critical threats, show warning instead of content
      if (detectionResult?.threatLevel === XSSThreatLevel.CRITICAL) {
        return (
          <div 
            className={`safe-html-blocked ${className || ''}`}
            style={style}
            data-testid="safe-html-blocked"
          >
            <span>🚨 Potentially malicious content blocked</span>
          </div>
        );
      }

      // Render sanitized content
      return (
        <div
          className={`safe-html ${className || ''}`}
          style={style}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          data-testid="safe-html-content"
          data-xss-protected="true"
          data-threat-level={detectionResult?.threatLevel || 'none'}
        />
      );
    } catch (error) {
      console.error('❌ SafeHTML render failed:', error);
      return (
        <div 
          className={`safe-html-error ${className || ''}`}
          style={style}
          data-testid="safe-html-error"
        >
          <span>⚠️ Render error</span>
        </div>
      );
    }
  }, [hasError, detectionResult, sanitizedContent, className, style]);

  return renderContent();
};

/**
 * SafeText Component
 * Safely renders text content with XSS protection (no HTML)
 */
export interface SafeTextProps {
  content: string;
  maxLength?: number;
  className?: string;
  style?: React.CSSProperties;
  onXSSDetected?: (result: XSSDetectionResult) => void;
}

export const SafeText: React.FC<SafeTextProps> = ({
  content,
  maxLength,
  className,
  style,
  onXSSDetected,
}) => {
  const sanitizedText = useMemo(() => {
    try {
      if (!content || typeof content !== 'string') {
        return '';
      }

      // Detect XSS in text content
      const result = xssProtection.detectXSS(content, ContentType.TEXT);
      
      if (result.isXSS && onXSSDetected) {
        onXSSDetected(result);
      }

      let sanitized = result.sanitizedContent;
      
      // Apply length limit
      if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength) + '...';
      }

      return sanitized;
    } catch (error) {
      console.error('❌ SafeText processing failed:', error);
      return '';
    }
  }, [content, maxLength, onXSSDetected]);

  return (
    <span 
      className={className}
      style={style}
      data-testid="safe-text"
      data-xss-protected="true"
    >
      {sanitizedText}
    </span>
  );
};

/**
 * SafeLink Component
 * Safely renders links with URL validation and XSS protection
 */
export interface SafeLinkProps {
  href: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onXSSDetected?: (result: XSSDetectionResult) => void;
}

export const SafeLink: React.FC<SafeLinkProps> = ({
  href,
  children,
  target = '_blank',
  rel = 'noopener noreferrer',
  className,
  style,
  onClick,
  onXSSDetected,
}) => {
  const { sanitizedHref, isBlocked } = useMemo(() => {
    try {
      if (!href || typeof href !== 'string') {
        return { sanitizedHref: '#', isBlocked: true };
      }

      // Detect XSS in URL
      const result = xssProtection.detectXSS(href, ContentType.URL);
      
      if (result.isXSS) {
        if (onXSSDetected) {
          onXSSDetected(result);
        }

        // Block critical threats
        if (result.threatLevel === XSSThreatLevel.CRITICAL || 
            result.threatLevel === XSSThreatLevel.HIGH) {
          return { sanitizedHref: '#', isBlocked: true };
        }
      }

      // Sanitize URL
      const sanitized = xssProtection.sanitizeContent(href, ContentType.URL);
      
      return { 
        sanitizedHref: sanitized || '#', 
        isBlocked: !sanitized 
      };
    } catch (error) {
      console.error('❌ SafeLink URL processing failed:', error);
      return { sanitizedHref: '#', isBlocked: true };
    }
  }, [href, onXSSDetected]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isBlocked) {
      event.preventDefault();
      console.warn('🚨 Blocked click on unsafe link:', href);
      return;
    }

    if (onClick) {
      onClick(event);
    }
  }, [isBlocked, href, onClick]);

  return (
    <a
      href={sanitizedHref}
      target={target}
      rel={rel}
      className={`${className || ''} ${isBlocked ? 'safe-link-blocked' : 'safe-link'}`}
      style={style}
      onClick={handleClick}
      data-testid="safe-link"
      data-xss-protected="true"
      data-blocked={isBlocked}
    >
      {isBlocked ? '🚫 Blocked Link' : children}
    </a>
  );
};

/**
 * SafeImage Component
 * Safely renders images with src validation and XSS protection
 */
export interface SafeImageProps {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  onError?: () => void;
  onXSSDetected?: (result: XSSDetectionResult) => void;
  fallbackSrc?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  width,
  height,
  className,
  style,
  onError,
  onXSSDetected,
  fallbackSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2U8L3RleHQ+PC9zdmc+',
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [hasError, setHasError] = useState(false);

  const sanitizedAlt = useMemo(() => {
    return xssProtection.sanitizeContent(alt || 'Image', ContentType.TEXT);
  }, [alt]);

  useEffect(() => {
    const processSrc = async () => {
      try {
        if (!src || typeof src !== 'string') {
          setImageSrc(fallbackSrc);
          return;
        }

        // Detect XSS in image src
        const result = xssProtection.detectXSS(src, ContentType.URL);
        
        if (result.isXSS) {
          if (onXSSDetected) {
            onXSSDetected(result);
          }

          // Block high threat images
          if (result.threatLevel === XSSThreatLevel.CRITICAL || 
              result.threatLevel === XSSThreatLevel.HIGH) {
            setImageSrc(fallbackSrc);
            return;
          }
        }

        // Sanitize image URL
        const sanitized = xssProtection.sanitizeContent(src, ContentType.URL);
        setImageSrc(sanitized || fallbackSrc);
      } catch (error) {
        console.error('❌ SafeImage src processing failed:', error);
        setImageSrc(fallbackSrc);
      }
    };

    processSrc();
  }, [src, fallbackSrc, onXSSDetected]);

  const handleError = useCallback(() => {
    if (!hasError) {
      setHasError(true);
      setImageSrc(fallbackSrc);
      
      if (onError) {
        onError();
      }
    }
  }, [hasError, fallbackSrc, onError]);

  return (
    <img
      src={imageSrc}
      alt={sanitizedAlt}
      width={width}
      height={height}
      className={className}
      style={style}
      onError={handleError}
      data-testid="safe-image"
      data-xss-protected="true"
      data-has-error={hasError}
    />
  );
};

/**
 * HOC for XSS Protection
 * Higher-order component that adds XSS protection to any component
 */
export function withXSSProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return React.forwardRef<any, P>((props, ref) => {
    const sanitizedProps = useMemo(() => {
      return xssProtection.validateReactProps(props as Record<string, any>) as P;
    }, [props]);

    return <WrappedComponent {...sanitizedProps} ref={ref} />;
  });
}

// CSS styles for safe components (to be included in your CSS)
export const safeComponentStyles = `
.safe-html-error {
  padding: 8px 12px;
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  color: #856404;
  font-size: 14px;
}

.safe-html-blocked {
  padding: 8px 12px;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  color: #721c24;
  font-size: 14px;
  font-weight: 500;
}

.safe-link-blocked {
  color: #6c757d !important;
  text-decoration: none !important;
  cursor: not-allowed !important;
  pointer-events: none;
}

.safe-html[data-threat-level="medium"],
.safe-html[data-threat-level="high"] {
  border-left: 3px solid #ffc107;
  padding-left: 8px;
}

.safe-html[data-threat-level="critical"] {
  border-left: 3px solid #dc3545;
  padding-left: 8px;
}
`;

export default SafeHTML;