import { spawn, type ChildProcess } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const children: ChildProcess[] = [
  spawn(npmCommand, ['run', 'dev:server'], {
    stdio: 'inherit',
    env: process.env,
  }),
  spawn(npmCommand, ['run', 'dev', '--', '--host', '0.0.0.0'], {
    stdio: 'inherit',
    env: process.env,
  }),
]

for (const child of children) {
  child.on('exit', (code) => {
    shutdown(code ?? 0)
  })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdown(0)
  })
}

function shutdown(code: number) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  process.exit(code)
}
