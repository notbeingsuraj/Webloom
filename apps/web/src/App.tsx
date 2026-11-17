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
import IntelligenceOverview from './pages/IntelligenceOverview';
import BusinessIntelligence from './pages/BusinessIntelligence';
import BusinessIntelligenceResults from './pages/BusinessIntelligenceResults';
import DigitalAudit from './pages/DigitalAudit';
import StrategyIntelligence from './pages/StrategyIntelligence';
import WebsiteGeneration from './pages/WebsiteGeneration';
import Operations from './pages/Operations';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import CookieConsent from './components/CookieConsent';
import StickyMobileCta from './components/StickyMobileCta';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Intelligence Terminal - Main Sections */}
          <Route index element={
            <ErrorBoundary label="Intelligence Overview"><IntelligenceOverview /></ErrorBoundary>
          } />
          <Route path="intelligence" element={
            <ErrorBoundary label="Intelligence Overview"><IntelligenceOverview /></ErrorBoundary>
          } />
          <Route path="intelligence/overview" element={
            <ErrorBoundary label="Intelligence Overview"><IntelligenceOverview /></ErrorBoundary>
          } />
          <Route path="intelligence/business" element={
            <ErrorBoundary label="Business Intelligence"><BusinessIntelligence /></ErrorBoundary>
          } />
          <Route path="intelligence/results/:id" element={
            <ErrorBoundary label="Extraction Results"><BusinessIntelligenceResults /></ErrorBoundary>
          } />
          <Route path="intelligence/audit/:id" element={
            <ErrorBoundary label="Digital Audit"><DigitalAudit /></ErrorBoundary>
          } />
          <Route path="intelligence/strategy/:id" element={
            <ErrorBoundary label="Strategy Intelligence"><StrategyIntelligence /></ErrorBoundary>
          } />

          {/* Website Generation */}
          <Route path="websites" element={
            <ErrorBoundary label="Website Generation"><WebsiteGeneration /></ErrorBoundary>
          } />

          {/* Operations & Infrastructure */}
          <Route path="operations" element={
            <ErrorBoundary label="Operations"><Operations /></ErrorBoundary>
          } />

          {/* Legacy routes - maintain backward compatibility */}
          <Route path="leads/new" element={
            <ErrorBoundary label="Lead analysis"><NewLead /></ErrorBoundary>
          } />
          <Route path="leads/:id" element={
            <ErrorBoundary label="Lead workspace"><LeadDetail /></ErrorBoundary>
          } />
          <Route path="generated-sites" element={
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