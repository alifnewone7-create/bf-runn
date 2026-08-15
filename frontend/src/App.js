import { useEffect } from 'react';
import './App.css';
import './lib/axios-global'; // installs global axios auto-refresh interceptor
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Home from './pages/Home';
import Login from './pages/Login';
import Registration from './pages/Registration';
import GoogleCallback from './pages/GoogleCallback';
import Dashboard from './pages/Dashboard';
import DemoTrade from './pages/DemoTrade';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import AdminPortal from './pages/AdminPortal';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
import ChallengesPage from './pages/ChallengesPage';
import { Toaster } from './components/ui/toaster';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfigProvider, useAppConfig } from './context/ConfigContext';

function ScrollTop() {
  const { pathname } = window.location;
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppRoutes() {
  const { googleClientId } = useAppConfig();
  return (
    <GoogleOAuthProvider clientId={googleClientId || ''}>
      <BrowserRouter>
        <ScrollTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/auth/google" element={<GoogleCallback />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/demo-trade" element={<DemoTrade />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/bfg-control-center-portal" element={<AdminPortal />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <ConfigProvider>
          <AppRoutes />
        </ConfigProvider>
      </ErrorBoundary>
    </div>
  );
}

export default App;
