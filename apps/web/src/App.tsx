import { NavLink, Route, Routes } from 'react-router-dom';
import { ObjectivesPage } from './pages/Objectives';
import { QuestionsPage } from './pages/Questions';
import { ReviewPage } from './pages/Review';

// Modules coming in later milestones. Shown greyed-out so the shell is visible
// but it's obvious what isn't built yet.
const COMING_SOON = ['Labs', 'Dashboard'];

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
          <NavLink to="/questions" className="nav-link">
            Questions
          </NavLink>
          <NavLink to="/review" className="nav-link">
            Review
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
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/review" element={<ReviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
