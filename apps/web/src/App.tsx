import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewLead from './pages/NewLead';
import LeadDetail from './pages/LeadDetail';
import GeneratedSites from './pages/GeneratedSites';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';
import ThankYou from './pages/ThankYou';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Terms from './pages/Terms';
import NotFound from './pages/NotFound';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import CookieConsent from './components/CookieConsent';
import StickyMobileCta from './components/StickyMobileCta';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={
            <ErrorBoundary label="Dashboard"><Dashboard /></ErrorBoundary>
          } />
          <Route path="leads/new" element={
            <ErrorBoundary label="Lead analysis"><NewLead /></ErrorBoundary>
          } />
          <Route path="leads/:id" element={
            <ErrorBoundary label="Lead workspace"><LeadDetail /></ErrorBoundary>
          } />
          <Route path="websites" element={
            <ErrorBoundary label="Generated websites"><GeneratedSites /></ErrorBoundary>
          } />
          <Route path="pricing" element={
            <ErrorBoundary label="Pricing"><Pricing /></ErrorBoundary>
          } />
          <Route path="contact" element={
            <ErrorBoundary label="Contact"><Contact /></ErrorBoundary>
          } />
          <Route path="contact/thanks" element={
            <ErrorBoundary label="Thank you"><ThankYou /></ErrorBoundary>
          } />
          <Route path="privacy" element={<PrivacyPolicy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="*" element={
            <ErrorBoundary label="Not found"><NotFound /></ErrorBoundary>
          } />
        </Route>
      </Routes>
      {/* Site-wide overlays */}
      <CookieConsent />
      <StickyMobileCta />
    </>
  );
}

export default App;
