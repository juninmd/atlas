import test from 'node:test'
import assert from 'node:assert/strict'
import { extractStack } from './stack.js'
import { dep } from './stack-fixtures.js'

test('npm manifest yields kinds, runtime and package manager; hostile shapes are ignored', () => {
  const stack = extractStack({ files: { 'package.json': JSON.stringify({
    dependencies: { hono: '^4.0.0' }, devDependencies: { vitepress: '^1.6.3' }, peerDependencies: 'not-an-object',
    engines: { node: '>=18' }, packageManager: 'pnpm@10.34.5' }) } })
  assert.deepEqual(stack.deps.map(d => [d.name, d.range, d.kind]), [['hono', '^4.0.0', 'prod'], ['vitepress', '^1.6.3', 'dev']])
  assert.equal(stack.runtimes.node, '>=18')
  assert.equal(stack.runtimes.packageManager, 'pnpm@10.34.5')
})

test('invalid or non-object package.json is reported, not thrown', () => {
  assert.deepEqual(extractStack({ files: { 'package.json': '{broken' } }).parseErrors, ['package.json'])
  assert.deepEqual(extractStack({ files: { 'package.json': '[]' } }).parseErrors, ['package.json'])
})

test('credentials in dependency specs never reach the index', () => {
  const token = 'ghp_' + 'a'.repeat(36)
  const stack = extractStack({ files: { 'package.json': JSON.stringify({ dependencies: {
    internal: `git+https://user:${token}@github.com/acme/internal.git`, other: `https://${token}@example.com/x.tgz` } }) } })
  assert.equal(JSON.stringify(stack).includes(token), false)
  assert.equal(JSON.stringify(stack).includes('user:'), false)
})

test('python manifests: extras, markers, comments, includes and VCS urls', () => {
  const stack = extractStack({ files: {
    'requirements.txt': '# pinned\nrequests[socks]==2.31.0 ; python_version>"3.8"\n-r other.txt\ngit+https://example.com/x.git\nFlask>=2 # web\n',
    'sub/pyproject.toml': '[project]\nrequires-python = ">=3.11"\ndependencies = [\n  "httpx[http2]>=0.27",\n  "rich",\n]\n[project.optional-dependencies]\ndev = ["pytest"]\n' } })
  assert.deepEqual(stack.deps.map(d => [d.name, d.range, d.path]).sort(), [['Flask', '>=2', ''], ['httpx', '>=0.27', 'sub'], ['requests', '==2.31.0', ''], ['rich', '*', 'sub']])
  assert.equal(stack.runtimes.python, '>=3.11')
})

test('cargo and go manifests', () => {
  const stack = extractStack({ files: {
    'Cargo.toml': '[package]\nrust-version = "1.80"\n[dependencies]\nserde = "1.0"\ntokio = { version = "1", features = ["full"] }\nlocal = { path = "../local" }\n[dev-dependencies]\ncriterion = "0.5"\n',
    'go.mod': 'module x\n\ngo 1.22\n\nrequire (\n\tgithub.com/a/b v1.2.3\n\tgolang.org/x/y v0.1.0 // indirect\n)\nrequire github.com/c/d v2.0.0\n' } })
  assert.deepEqual(dep(stack, 'tokio'), { ecosystem: 'cargo', name: 'tokio', range: '1', kind: 'prod', path: '' })
  assert.equal(dep(stack, 'local').range, '(sem versão)')
  assert.equal(dep(stack, 'criterion').kind, 'dev')
  assert.equal(dep(stack, 'golang.org/x/y').kind, 'indirect')
  assert.equal(dep(stack, 'github.com/c/d').range, 'v2.0.0')
  assert.equal(stack.runtimes.rust, '1.80')
  assert.equal(stack.runtimes.go, '1.22')
})

test('Dockerfile lists base images but not earlier build stages or scratch', () => {
  const stack = extractStack({ files: { Dockerfile: 'FROM --platform=linux/amd64 node:24-slim AS build\nFROM build AS test\nFROM scratch\nFROM nginx:1.27\n' } })
  assert.deepEqual(stack.runtimes.docker, ['node:24-slim', 'nginx:1.27'])
})

test('shallowest manifest wins runtime; monorepo packages keep their path', () => {
  const stack = extractStack({ files: {
    'packages/api/package.json': JSON.stringify({ dependencies: { hono: '^3' }, engines: { node: '>=16' } }),
    'package.json': JSON.stringify({ engines: { node: '>=20' } }), '.nvmrc': 'v22.1.0\n' } })
  assert.equal(stack.runtimes.node, '>=20')
  assert.equal(stack.runtimes.nodeFile, 'v22.1.0')
  assert.equal(dep(stack, 'hono').path, 'packages/api')
})

test('a file named like an Object.prototype member is not executed as a handler', () => {
  const stack = extractStack({ files: { __defineGetter__: 'x', constructor: 'x', toString: 'x' } })
  assert.deepEqual([stack.deps, stack.parseErrors, stack.runtimes], [[], [], {}])
})

test('reusable workflow references are extracted; local and action refs are not', () => {
  const stack = extractStack({ lockfiles: ['pnpm-lock.yaml', 'pnpm-lock.yaml'], workflows: {
    'validate.yml': 'jobs:\n  check:\n    uses: acme/base-actions/.github/workflows/reusable-validate.yml@main\n',
    'local.yml': 'jobs:\n  a:\n    uses: ./.github/workflows/other.yml\n  b:\n    steps:\n      - uses: actions/checkout@v4\n',
    'pinned.yaml': "jobs:\n  x:\n    uses: 'acme/base-actions/.github/workflows/reusable-validate.yml@abc123' # pin\n" } })
  assert.equal(stack.ci.workflows, 3)
  assert.deepEqual(stack.ci.reusable.map(r => `${r.repo}/${r.file}@${r.ref}`), [
    'acme/base-actions/reusable-validate.yml@main', 'acme/base-actions/reusable-validate.yml@abc123'])
  assert.deepEqual(stack.lockfiles, ['pnpm-lock.yaml'])
})

test('userinfo is stripped up to the last @, and look-alike names survive redaction', () => {
  const stack = extractStack({ files: { 'package.json': JSON.stringify({ dependencies: {
    leaky: 'git+https://user:p@ssw0rdSECRET@github.com/acme/x.git', 'task-manager-integration-tools': '1' } }) } })
  assert.equal(JSON.stringify(stack).includes('SECRET'), false)
  assert.ok(dep(stack, 'task-manager-integration-tools'))
})

test('control characters cannot reach the terminal and hostile input stays fast', () => {
  const stack = extractStack({ files: { 'package.json': JSON.stringify({ dependencies: { 'a\u001b[31mb': '1\nfake\trow' } }) } })
  assert.equal(/[\u0000-\u001f\u007f-\u009f]/.test(stack.deps[0].name + stack.deps[0].range), false)
  const started = Date.now()
  extractStack({ files: { 'pyproject.toml': '[project]\n' + 'dependencies = [\n'.repeat(60000), 'package.json': JSON.stringify({ dependencies: { x: ('-----BEGIN ' + 'PRIVATE KEY-----').repeat(8000) } }) } })
  assert.ok(Date.now() - started < 1000)
})

test('cargo: non-dependency tables, target tables, renamed and workspace dependencies', () => {
  const stack = extractStack({ files: { 'Cargo.toml': [
    '[dependencies]', 'serde = "1"', 'serde_json.workspace = true', 'foo = { package = "real-name", version = "2" }',
    "[target.'cfg(unix)'.dependencies]", 'libc = "0.2"', '[[bin]]', 'name = "tool"', 'path = "src/main.rs"'].join('\n') } })
  assert.deepEqual(stack.deps.map(d => [d.name, d.range]).sort(), [['libc', '0.2'], ['real-name', '2'], ['serde', '1'], ['serde_json', 'workspace']])
})

test('pyproject: only [project], comments ignored, trailing text and other keys do not leak in', () => {
  const stack = extractStack({ files: { 'pyproject.toml': [
    '[tool.hatch.envs.default]', 'dependencies = ["pytest"]', '[project]', 'dependencies = [', '  "a>=1", # why',
    '  # "removed>=2",', '  "b",', '] # done', 'keywords = ["cli"]', '[project.optional-dependencies]', 'dev = ["c"]'].join('\n') } })
  assert.deepEqual(stack.deps.map(d => d.name), ['a', 'b'])
})

test('requirements hash continuations and go.mod comments are not dependencies or ranges', () => {
  const stack = extractStack({ files: {
    'requirements.txt': 'requests==2.31.0 \\\n    --hash=sha256:abc\nflask==3 --hash=sha256:def\n',
    'go.mod': 'module x\nrequire (\n\t// v1.2.3 pinned for CVE\n\tgithub.com/a/b v1.0.0\n)\n' } })
  assert.deepEqual(stack.deps.map(d => [d.name, d.range]).sort(), [['flask', '==3'], ['github.com/a/b', 'v1.0.0'], ['requests', '==2.31.0']])
})

test('Dockerfile stage names are case-insensitive; commented workflow refs are ignored; lts/* is a node version', () => {
  const stack = extractStack({ files: { Dockerfile: 'FROM node:24 AS Build\nFROM build\n', '.nvmrc': 'lts/*\n' },
    workflows: { 'a.yml': '# uses: o/r/.github/workflows/x.yml@main\n    uses: o/r/.github/workflows/y.yml@main\n' } })
  assert.deepEqual(stack.runtimes.docker, ['node:24'])
  assert.equal(stack.runtimes.nodeFile, 'lts/*')
  assert.deepEqual(stack.ci.reusable.map(r => r.file), ['y.yml'])
})
