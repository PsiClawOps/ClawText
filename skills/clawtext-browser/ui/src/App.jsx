import { useState } from 'react';
import SearchPanel from './components/SearchPanel.jsx';
import GraphPanel from './components/GraphPanel.jsx';
import AntiPatternPanel from './components/AntiPatternPanel.jsx';
import LearningsPanel from './components/LearningsPanel.jsx';
import HygienePanel from './components/HygienePanel.jsx';
import StatusBar from './components/StatusBar.jsx';

const TABS = [
  { id: 'search',    label: '🔍 Search',    icon: '🔍' },
  { id: 'graph',     label: '🕸 Graph',     icon: '🕸' },
  { id: 'walls',     label: '🧱 Walls',     icon: '🧱' },
  { id: 'learnings', label: '🧠 Learnings', icon: '🧠' },
  { id: 'hygiene',   label: '🧹 Hygiene',   icon: '🧹' },
];

const API = 'http://localhost:3737';

export default function App() {
  const [activeTab, setActiveTab] = useState('graph');
  const [selectedMemory, setSelectedMemory] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🧠</span>
          <div>
            <div style={styles.logoTitle}>ClawText</div>
            <div style={styles.logoSub}>Memory Browser</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              style={{
                ...styles.navBtn,
                ...(activeTab === tab.id ? styles.navBtnActive : {}),
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={styles.navIcon}>{tab.icon}</span>
              <span>{tab.label.split(' ').slice(1).join(' ')}</span>
            </button>
          ))}
        </nav>

        <StatusBar api={API} />
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        {activeTab === 'search' && (
          <SearchPanel
            api={API}
            onSelectMemory={setSelectedMemory}
            selectedMemory={selectedMemory}
          />
        )}
        {activeTab === 'graph' && (
          <GraphPanel
            api={API}
            onSelectCluster={setSelectedCluster}
            selectedCluster={selectedCluster}
            onNavigateToWalls={() => setActiveTab('walls')}
          />
        )}
        {activeTab === 'walls' && (
          <AntiPatternPanel
            api={API}
          />
        )}
        {activeTab === 'learnings' && (
          <LearningsPanel api={API} />
        )}
        {activeTab === 'hygiene' && (
          <HygienePanel api={API} />
        )}
      </main>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#0d1117',
    color: '#c9d1d9',
  },
  sidebar: {
    width: '200px',
    minWidth: '200px',
    background: '#161b22',
    borderRight: '1px solid #30363d',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem',
    gap: '0.5rem',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.5rem 0 1rem',
    borderBottom: '1px solid #30363d',
    marginBottom: '0.5rem',
  },
  logoIcon: { fontSize: '1.5rem' },
  logoTitle: { fontSize: '0.9rem', fontWeight: '700', color: '#e6edf3' },
  logoSub: { fontSize: '0.7rem', color: '#8b949e' },
  nav: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: 'transparent',
    border: 'none',
    color: '#8b949e',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '0.85rem',
    textAlign: 'left',
    width: '100%',
    transition: 'all 0.15s',
  },
  navBtnActive: {
    background: '#21262d',
    color: '#58a6ff',
    fontWeight: '600',
  },
  navIcon: { fontSize: '1rem' },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
};
