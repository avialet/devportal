import { Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import NewProject from './pages/NewProject';
import Monitoring from './pages/Monitoring';
import Security from './pages/Security';
import Settings from './pages/Settings';
import Layout from './components/Layout';

export default function App() {
  const { user, loading, oidcAvailable, loginWithOidc, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Login onLoginOidc={loginWithOidc} oidcAvailable={oidcAvailable} />;
  }

  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewProject />} />
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/security" element={<Security />} />
        <Route path="/projects/:uuid" element={<ProjectDetail />} />
        <Route path="/settings" element={<Settings user={user} />} />
      </Routes>
    </Layout>
  );
}
