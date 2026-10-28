import { Component } from 'react';

// If a screen crashes, show what went wrong instead of a blank page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="container">
        <div className="crash-card" role="alert">
          <h1>This screen couldn't load</h1>
          <p className="muted">
            Refresh the page. If it still happens, restart the server (npm run api, or npm start) and try
            again.
          </p>
          <pre className="crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}
