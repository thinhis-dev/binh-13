import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()
const searchRoots = ['coverage', 'apps', 'packages']
const removedCoverageDirs = []

async function removeCoverageDirs(relativePath) {
  const absolutePath = path.resolve(workspaceRoot, relativePath)

  if (!isInsideWorkspace(absolutePath)) {
    throw new Error(`Refusing to inspect outside the workspace: ${absolutePath}`)
  }

  if (path.basename(absolutePath) === 'coverage') {
    try {
      await stat(absolutePath)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    await rm(absolutePath, { recursive: true, force: true })
    removedCoverageDirs.push(toPosix(relativePath))
    return
  }

  let entries
  try {
    entries = await readdir(absolutePath, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    await removeCoverageDirs(path.join(relativePath, entry.name))
  }
}

function isInsideWorkspace(absolutePath) {
  const relative = path.relative(workspaceRoot, absolutePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

await Promise.all(searchRoots.map((root) => removeCoverageDirs(root)))

if (removedCoverageDirs.length > 0) {
  console.log(`Removed coverage output: ${removedCoverageDirs.sort().join(', ')}`)
}
