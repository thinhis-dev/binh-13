import { spawnSync } from 'node:child_process'

const gitRepoCheck = spawnSync('git', ['rev-parse', '--git-dir'], {
  stdio: 'ignore',
})

if (gitRepoCheck.error?.code === 'ENOENT' || gitRepoCheck.status !== 0) {
  process.exit(0)
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  stdio: 'inherit',
})

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.warn('Git was not found; skipped hook installation.')
    process.exit(0)
  }

  throw result.error
}

process.exit(result.status ?? 0)
