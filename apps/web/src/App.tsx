import { NavLink, Route, Routes } from 'react-router-dom';
import { ObjectivesPage } from './pages/Objectives';

// Modules coming in later milestones. Shown greyed-out so the shell is visible
// but it's obvious what isn't built yet.
const COMING_SOON = ['Questions', 'Review', 'Labs', 'Dashboard'];

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          LLMStudy <span className="brand-sub">· NCA-GENL</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            Objectives
          </NavLink>
          {COMING_SOON.map((label) => (
            <span key={label} className="nav-link nav-soon" title="Coming in a later milestone">
              {label}
            </span>
          ))}
        </nav>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<ObjectivesPage />} />
        </Routes>
      </main>
    </div>
  );
}
