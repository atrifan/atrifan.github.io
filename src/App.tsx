import { Component } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { HomePage } from './pages/HomePage';
import { CutPage } from './pages/CutPage';
import { StackPage } from './pages/StackPage';
import { WhenPage } from './pages/WhenPage';
import { TapPage } from './pages/TapPage';
import { LuckPage } from './pages/LuckPage';

/**
 * Main App Component with Routing
 * Uses HashRouter for GitHub Pages compatibility
 */
class App extends Component {
  render() {
    return (
      <Provider theme={defaultTheme} colorScheme="dark">
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cut" element={<CutPage />} />
            <Route path="/stack" element={<StackPage />} />
            <Route path="/when" element={<WhenPage />} />
            <Route path="/tap" element={<TapPage />} />
            <Route path="/luck" element={<LuckPage />} />
          </Routes>
        </HashRouter>
      </Provider>
    );
  }
}

export default App;

