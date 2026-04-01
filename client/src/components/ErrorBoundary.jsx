import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected app error.",
    };
  }

  componentDidCatch(error, info) {
    console.error("App runtime error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center p-4">
        <section className="panel w-full max-w-xl">
          <p className="section-kicker">Journex</p>
          <h1 className="mt-1 text-xl font-semibold text-textMain">Something went wrong</h1>
          <p className="mt-2 text-sm text-textMuted">
            The app hit an unexpected error. Refresh to recover your session.
          </p>
          <p className="mt-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
            {this.state.message}
          </p>
          <button type="button" className="btn-primary mt-3" onClick={this.handleReload}>
            Reload app
          </button>
        </section>
      </main>
    );
  }
}

export default ErrorBoundary;
