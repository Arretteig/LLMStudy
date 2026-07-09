import { NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/Dashboard';
import { DrillPage } from './pages/Drill';
import { ExamRunnerPage } from './pages/ExamRunner';
import { ExamsPage } from './pages/Exams';
import { LabRunsPage } from './pages/LabRuns';
import { LabTemplatesPage } from './pages/LabTemplates';
import { ObjectivesPage } from './pages/Objectives';
import { QuestionsPage } from './pages/Questions';
import { ReviewPage } from './pages/Review';
import { SettingsPage } from './pages/Settings';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/objectives', label: 'Objectives' },
  { to: '/questions', label: 'Questions' },
  { to: '/review', label: 'Review' },
  { to: '/drill', label: 'Drill' },
  { to: '/exams', label: 'Exams' },
  { to: '/labs', label: 'Labs' },
  { to: '/runs', label: 'Runs' },
  { to: '/settings', label: 'Settings' },
];

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          LLMStudy <span className="brand-sub">· NCA-GENL</span>
        </div>
        <nav className="nav">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/objectives" element={<ObjectivesPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/drill" element={<DrillPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:id" element={<ExamRunnerPage />} />
          <Route path="/labs" element={<LabTemplatesPage />} />
          <Route path="/runs" element={<LabRunsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
