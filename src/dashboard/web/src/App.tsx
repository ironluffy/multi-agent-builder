import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Workflows from './pages/Workflows';
import Approvals from './pages/Approvals';
import LinearIntegration from './pages/LinearIntegration';
import { useSocketStore } from './stores/socketStore';

function App() {
  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/linear" element={<LinearIntegration />} />
      </Routes>
    </Layout>
  );
}

export default App;
