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
import CookieConsent from './components/CookieConsent';
import StickyMobileCta from './components/StickyMobileCta';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="leads/new" element={<NewLead />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="websites" element={<GeneratedSites />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="contact" element={<Contact />} />
          <Route path="contact/thanks" element={<ThankYou />} />
          <Route path="privacy" element={<PrivacyPolicy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      {/* Site-wide overlays */}
      <CookieConsent />
      <StickyMobileCta />
    </>
  );
}

export default App;
