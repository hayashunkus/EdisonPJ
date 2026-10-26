import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    // GitHubのリポジトリ名が "EdisonPJ" の場合は '/EdisonPJ/' とします
    base: '/EdisonPJ/',
})