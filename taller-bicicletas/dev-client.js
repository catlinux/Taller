import { spawn } from 'child_process'

const vite = spawn('node', ['node_modules/vite/bin/vite.js'], {
  stdio: 'inherit',
  shell: true,
})

vite.on('close', (code) => {
  process.exit(code)
})
