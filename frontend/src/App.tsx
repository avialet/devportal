import { Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import NewProject from './pages/NewProject';
import Monitoring from './pages/Monitoring';
import Users from './pages/Users';
import Security from './pages/Security';
import Layout from './components/Layout';

export default function App() {
  const { user, loading, oidcAvailable, loginWithOidc, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
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
        <Route path="/users" element={<Users />} />
        <Route path="/projects/:uuid" element={<ProjectDetail />} />
      </Routes>
    </Layout>
  );
}
