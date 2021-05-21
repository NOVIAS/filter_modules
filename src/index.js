const { resolve, normalize } = require('path')
const fastGlob = require('fast-glob')
const { traverseModule, setRequirePathResolver } = require(
  './traverseModules')

const defaultOptions = {
  cwd: '',
  entries: [],
  includes: ['**/*', '!node_modules'],
  resolveRequirePath: () => {}
}

function filterModules (options) {
  let { cwd, entries, includes, resolveRequirePath } = Object.assign(
    defaultOptions, options)

  // 根据传入的 cwd 表示是否需要在某个指定目录下搜素
  // ! window 上的路径需要替换
  includes = includes.map(
    includePath => (cwd
      ? `${resolve(cwd, includePath).replace(/\\/g, '/')}`
      : includePath.replace(/\\/g, '/'))
  )
  // 用来批量加载某个路径下的所有文件
  const allFiles = fastGlob.sync(includes, { dot: false }).
    map(item => normalize(item))
  const entryModules = []
  const usedModules = []

  setRequirePathResolver(resolveRequirePath)

  entries.forEach(entry => {
    const entryPath = resolve(cwd, entry)
    entryModules.push(entryPath)
    traverseModule(entryPath, (modulePath) => {
      usedModules.push(modulePath)
    })
  })

  const filteredModules = allFiles.filter(filePath => {
    const resolvedPath = resolve(filePath)
    // 查找不存在的路径
    return !entryModules.includes(resolvedPath) &&
      !usedModules.includes(resolvedPath)
  })

  return {
    all: allFiles,
    used: usedModules,
    filtered: filteredModules
  }
}

module.exports = filterModules
