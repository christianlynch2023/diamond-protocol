// Contains a crash to one screen. Before round 2, an error in any screen reached the root boundary and
// took the whole app down mid-session; now only that screen shows a message, and the tabs keep working.
import { Component } from 'react';
import type { ReactNode } from 'react';

export class ViewBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { try { console.error(`${this.props.name} screen failed`, err); } catch (_) { /* ignore */ } }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <div className="topbar"><span className="logo">{this.props.name}</span></div>
        <div className="vb-msg">
          <div className="vb-ttl">{this.props.name} couldn't load.</div>
          <div className="td2-meta">Your data is safe. The other tabs still work.</div>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => window.location.reload()}>Reload the app</button>
        </div>
      </div>
    );
  }
}
