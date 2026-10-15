// the allowed-imports matrix between the src modules and the dependency-cruiser rules generated from it

// the allowed-imports matrix. each key is a module under src and its value lists the modules it may import
const allowedImports = {
  shared: [],
  audit: ['shared'],
  'run-state': ['shared'],
  'pull-request-source': ['shared'],
  lockfile: ['shared'],
  advisories: ['shared'],
  matcher: ['shared'],
  reachability: ['shared'],
  secrets: ['shared'],
  prompts: ['shared'],
  llm: ['shared'],
  report: ['shared'],
  'code-review': ['shared', 'llm', 'prompts'],
  summarize: ['shared', 'llm', 'prompts'],
  pipeline: [
    'shared',
    'audit',
    'run-state',
    'pull-request-source',
    'lockfile',
    'advisories',
    'matcher',
    'reachability',
    'secrets',
    'prompts',
    'llm',
    'report',
    'code-review',
    'summarize',
  ],
  benchmark: ['shared', 'pipeline', 'report', 'pull-request-source'],
  harness: ['shared', 'benchmark', 'prompts', 'llm'],
  server: ['shared', 'pipeline', 'report', 'benchmark'],
  cli: [
    'shared',
    'pipeline',
    'report',
    'benchmark',
    'harness',
    'server',
    'advisories',
    'matcher',
    'pull-request-source',
  ],
}

// the module list is the keys of the matrix
const moduleNames = Object.keys(allowedImports)

// forbid every import from a module into a src module the matrix does not grant it. a module may always import itself
const boundaryRules = moduleNames.map((moduleName) => {
  const importableModules = [moduleName, ...allowedImports[moduleName]]
  return {
    name: `boundary-${moduleName}`,
    severity: 'error',
    from: { path: `^src/${moduleName}/` },
    to: { path: '^src/', pathNot: `^src/(${importableModules.join('|')})/` },
  }
})

// forbid a barrel file: an index.ts directly inside a module directory, whatever it imports
const noBarrelFilesRule = {
  name: 'no-barrel-files',
  severity: 'error',
  from: { path: '^src/[^/]+/index\\.ts$' },
  to: {},
}

module.exports = {
  forbidden: [...boundaryRules, noBarrelFilesRule],
  options: {
    // resolve the "@/" alias through the repo tsconfig
    tsConfig: { fileName: 'tsconfig.json' },
    // count type-only imports as dependencies
    tsPreCompilationDeps: true,
    // stop at installed packages
    doNotFollow: { path: 'node_modules' },
    // try .ts before .js when an import names no extension
    enhancedResolveOptions: { extensions: ['.ts', '.js'] },
  },
}
