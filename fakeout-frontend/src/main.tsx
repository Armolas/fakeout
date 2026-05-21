import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './config/wagmi'
import App from './App'
import { WhimsyBackdrop } from './components/WhimsyBackdrop'
import { initTheme } from './hooks/useTheme'
import './index.css'

initTheme()

// When a lazily-loaded chunk 404s after a new deployment, reload to pick up
// the latest assets rather than showing a cryptic JS error.
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WhimsyBackdrop />
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
)
