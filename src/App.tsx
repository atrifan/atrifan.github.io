import { Component } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Analytics } from './components/Analytics';
import { HomePage } from './pages/HomePage';
import { CutPage } from './pages/CutPage';
import { StackPage } from './pages/StackPage';
import { WhenPage } from './pages/WhenPage';
import { TapPage } from './pages/TapPage';
import { LuckPage } from './pages/LuckPage';
import { MatchPage } from './pages/MatchPage';
import { NotFoundPage } from './pages/NotFoundPage';
// New tools
import { AgePage } from './pages/AgePage';
import { DaysPage } from './pages/DaysPage';
import { PercentPage } from './pages/PercentPage';
import { ConvertPage } from './pages/ConvertPage';
import { SleepPage } from './pages/SleepPage';
import { DecidePage } from './pages/DecidePage';
import { SpinPage } from './pages/SpinPage';
import { FlipPage } from './pages/FlipPage';
import { TipPage } from './pages/TipPage';
import { ZonePage } from './pages/ZonePage';
import { NamesPage } from './pages/NamesPage';
import { RankPage as UniquePage } from './pages/RankPage';
import { BrainPage } from './pages/BrainPage';
import { VibePage } from './pages/VibePage';
import { CyclePage } from './pages/CyclePage';
import { RiskPage } from './pages/RiskPage';

/**
 * Main App Component with Routing
 * Uses HashRouter for GitHub Pages compatibility
 */
class App extends Component {
  render() {
    return (
      <Provider theme={defaultTheme} colorScheme="dark">
        <HashRouter>
          <Analytics />
          <Routes>
            <Route path="/" element={<HomePage />} />
            {/* Health */}
            <Route path="/cut" element={<CutPage />} />
            <Route path="/sleep" element={<SleepPage />} />
            <Route path="/unique" element={<UniquePage />} />
            <Route path="/cycle" element={<CyclePage />} />
            <Route path="/age" element={<AgePage />} />
            {/* Money */}
            <Route path="/stack" element={<StackPage />} />
            <Route path="/tip" element={<TipPage />} />
            <Route path="/risk" element={<RiskPage />} />
            <Route path="/percent" element={<PercentPage />} />
            {/* Time */}
            <Route path="/when" element={<WhenPage />} />
            <Route path="/days" element={<DaysPage />} />
            <Route path="/zone" element={<ZonePage />} />
            {/* Utilities */}
            <Route path="/tap" element={<TapPage />} />
            <Route path="/convert" element={<ConvertPage />} />
            <Route path="/names" element={<NamesPage />} />
            {/* Fun */}
            <Route path="/luck" element={<LuckPage />} />
            <Route path="/flip" element={<FlipPage />} />
            <Route path="/spin" element={<SpinPage />} />
            <Route path="/decide" element={<DecidePage />} />
            <Route path="/match" element={<MatchPage />} />
            <Route path="/brain" element={<BrainPage />} />
            <Route path="/vibe" element={<VibePage />} />
            {/* 404 - No ads on this page */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </HashRouter>
      </Provider>
    );
  }
}

export default App;

