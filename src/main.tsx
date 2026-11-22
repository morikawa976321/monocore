import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import RootLayout from '@/src/app/layout'
import '@/src/app/globals.css'
import { Routes } from '@/src/router'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <RootLayout>
            <Routes />
        </RootLayout>
    </StrictMode>,
)
