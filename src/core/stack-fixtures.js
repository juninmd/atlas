export const b64 = text => ({ encoding: 'base64', content: Buffer.from(text).toString('base64') })
export const dep = (stack, name) => stack.deps.find(d => d.name === name)
export const repo = (name, extra = {}) => ({ name, owner: 'me', private: false, archived: false, fork: false, branch: 'main', pushed_at: '2026-01-01', ...extra })
export function fakeGithub(files, calls = []) {
  return async path => {
    calls.push(path)
    if (path.includes('/git/trees/')) return { truncated: false, tree: Object.entries(files).map(([p, c]) => ({ path: p, type: 'blob', size: c.length })) }
    const file = decodeURIComponent(path.split('/contents/')[1])
    if (!(file in files)) throw Object.assign(new Error('x'), { status: 404 })
    return b64(files[file])
  }
}
