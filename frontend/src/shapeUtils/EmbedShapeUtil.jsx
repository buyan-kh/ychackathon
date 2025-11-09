import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';
import React, { memo } from 'react';

// Memoized embed component
const EmbedComponent = memo(({ shape }) => {
  const embedUrl = shape.props.embedUrl;
  const service = shape.props.service || 'unknown';
  const query = shape.props.query || '';

  if (!embedUrl) {
    return (
      <HTMLContainer>
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px dashed #D1D5DB',
          borderRadius: '12px',
          padding: '24px',
          background: '#F9FAFB'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p style={{ color: '#6B7280', marginTop: '12px', fontSize: '14px' }}>
            No embed URL
          </p>
        </div>
      </HTMLContainer>
    );
  }

  // Determine service icon and title
  let icon, title;
  if (service === 'google_maps') {
    icon = (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    );
    title = query ? `${query} nearby` : 'Google Maps';
  } else if (service === 'youtube') {
    icon = (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    );
    title = 'YouTube';
  } else {
    icon = (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
    title = 'Embed';
  }

  return (
    <HTMLContainer style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid #E5E7EB',
      background: '#FFFFFF',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: '#F9FAFB',
        flexShrink: 0
      }}>
        {icon}
        <span style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#111827',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {title}
        </span>
      </div>

      {/* Iframe container */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#FFFFFF'
      }}>
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          allow="geolocation"
          style={{
            border: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
          title={`${service} embed`}
        />
      </div>
    </HTMLContainer>
  );
});

EmbedComponent.displayName = 'EmbedComponent';

export class EmbedShapeUtil extends BaseBoxShapeUtil {
  static type = 'custom-embed';

  getDefaultProps() {
    return {
      w: 600,
      h: 450,
      embedUrl: '',
      service: '',
      query: '',
    };
  }

  onResize = (shape, info) => {
    const { scaleX, scaleY } = info;
    return {
      props: {
        ...shape.props,
        w: Math.max(300, shape.props.w * scaleX),
        h: Math.max(250, shape.props.h * scaleY),
      },
    };
  };

  component = (shape) => {
    return <EmbedComponent shape={shape} />;
  };

  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}
