import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Filter out ResizeObserver errors
    if (error && error.message && error.message.includes('ResizeObserver loop')) {
      return { hasError: false };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Filter out ResizeObserver errors
    if (error && error.message && error.message.includes('ResizeObserver loop')) {
      return;
    }
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center',
          color: '#ef4444'
        }}>
          <h1>Something went wrong.</h1>
          <p>{this.state.error?.message}</p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;


