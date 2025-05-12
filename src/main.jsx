import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DotGlobe from './Globe.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DotGlobe />
  </StrictMode>,
)
