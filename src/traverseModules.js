const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const fs = require('fs')
const { resolve, dirname, join, extname } = require('path')
// 用于在终端输出颜色不同的内容
const chalk = require('chalk')
const postcss = require('postcss')
const postcssLess = require('postcss-less')
const postcssScss = require('postcss-scss')

const JS_EXT = ['.js', '.jsx', '.ts', '.tsx']
const CSS_EXT = ['.css', '.less', '.scss']
const JSON_EXT = ['.json']

let requirePathResolver = () => {}

const MODULE_TYPES = {
  JS: 1 << 0,
  CSS: 1 << 1,
  JSON: 1 << 2
}

// 存放已经处理过的模块路径
const visitedModules = new Set()

// 尝试对一个路径进行解析, 判断是否是路径 (因为忽略了后缀名, 所以需要判断)
function isDirectory (filePath) {
  try {
    return fs.statSync(filePath).isDirectory()
  } catch (e) {
    return false
  }
}

function moduleResolve (curModulePath, requirePath) {
  if (typeof requirePathResolver === 'function') {
    const res = requirePathResolver(dirname(curModulePath), requirePath)
    if (typeof res === 'string') {
      requirePath = res
    }
  }

  requirePath = resolve(dirname(curModulePath), requirePath)

  // 对第三方模块不进行检测
  if (requirePath.includes('node_modules')) {
    return ''
  }

  requirePath = completeModulePath(requirePath)

  if (visitedModules.has(requirePath)) {
    return ''
  } else {
    visitedModules.add(requirePath)
  }
  return requirePath
}

exports.setRequirePathResolver = function (resolver) {
  requirePathResolver = resolver
}

function completeModulePath (modulePath) {
  const EXTS = [...JSON_EXT, ...JS_EXT]
  // 表示带有后缀名的直接返回
  if (modulePath.match(/\.[a-zA-Z]+$/)) return modulePath

  // 尝试添加不同的后缀名, 返回正确的路径后缀
  function tryCompletePath (resolvePath) {
    for (let i = 0; i < EXTS.length; i++) {
      let tempPath = resolvePath(EXTS[i])
      if (fs.existsSync(tempPath)) return tempPath
    }
  }

  function NotFoundModule (modulePath) {
    throw chalk.red('module not found: ' + modulePath)
  }

  // 如果传入路径是一个目录
  if (isDirectory(modulePath)) {
    const tryModulePath = tryCompletePath(
      (ext) => join(modulePath, 'index' + ext))
    if (!tryModulePath) {
      NotFoundModule(tryModulePath)
    } else {
      return tryModulePath
    }
  } else if (!EXTS.some(ext => modulePath.endsWith(ext))) {
    const tryModulePath = tryCompletePath((ext) => modulePath + ext)
    if (!tryModulePath) {
      NotFoundModule(tryModulePath)
    } else {
      return tryModulePath
    }
  }

  return modulePath
}

// 解析对应类型
function getModuleType (modulePath) {
  const moduleExt = extname(modulePath)
  if (JS_EXT.some(ext => ext === moduleExt)) {
    return MODULE_TYPES.JS
  } else if (CSS_EXT.some(ext => ext === moduleExt)) {
    return MODULE_TYPES.CSS
  } else if (JSON_EXT.some(ext => ext === moduleExt)) {
    return MODULE_TYPES.JSON
  }
}

function resolveBabelSyntaxPlugins (modulePath) {
  const plugins = []
  if (['.tsx', '.jsx'].some(ext => modulePath.endsWith(ext))) {
    plugins.push('jsx')
  }
  if (['.ts', '.tsx'].some(ext => modulePath.endsWith(ext))) {
    plugins.push('typescript')
  }
  return plugins
}

function traverseJsModule (currentModulePath, callback) {
  const moduleFileContent = fs.readFileSync(currentModulePath,
    { encoding: 'utf-8' })
  // 通过 parser 转换为 ast, unambiguous 表明基于 ES6
  const ast = parser.parse(moduleFileContent, {
    sourceType: 'unambiguous',
    plugins: resolveBabelSyntaxPlugins(currentModulePath)
  })

  // 根据 ast 提取依赖关系
  traverse(ast, {
    ImportDeclaration (path) {
      const subModulePath = moduleResolve(currentModulePath,
        path.get('source.value').node)
      if (!subModulePath) return
      callback && callback(subModulePath)
      traverseModule(subModulePath, callback)
    },
    CallExpression (path) {
      if (path.get('callee').toString() === 'require') {
        const subModulePath = moduleResolve(currentModulePath,
          path.get('arguments.0').toString().replace(/['"]/g, ''))
        if (!subModulePath) return
        callback && callback(subModulePath)
        // 递归寻找依赖
        traverseModule(subModulePath, callback)
      }
    }
  })
}

// 针对不同的 css 文件, 使用不同的插件处理
function resolvePostcssSyntaxPlugin (modulePath) {
  if (modulePath.endsWith('.scss')) {
    return postcssScss
  }
  if (modulePath.endsWith('.less')) {
    return postcssLess
  }
}

function traverseCssModule (currentModulePath, callback) {
  const moduleFileContent = fs.readFileSync(currentModulePath,
    { encoding: 'utf-8' })
  // 使用 postcss 对传入的 css 进行转换
  const ast = postcss.parse(moduleFileContent, {
    syntax: resolvePostcssSyntaxPlugin(currentModulePath)
  })
  // 处理 import 情况
  ast.walkAtRules('import', rule => {
    const subModulePath = moduleResolve(currentModulePath,
      rule.params.replace(/['"]/g, ''))
    if (!subModulePath) return
    callback && callback(subModulePath)
    traverseModule(subModulePath, callback)
  })
  // 处理 url 情况
  ast.walkDecls(decl => {
    if (decl.value.includes('url(')) {
      const temp = /.*url\((.+)\).*/.exec(decl.value)
      let url = ''
      if (temp[1]) {
        url = temp[1].replace(/['"]/g, '')
      } else {
        throw new Error('传入的 url 为空')
      }
      const subModulePath = moduleResolve(currentModulePath, url)
      if (!subModulePath) return
      callback && callback(subModulePath)
    }
  })
}

function traverseModule (currentModulePath, callback) {
  currentModulePath = completeModulePath(currentModulePath)
  const moduleType = getModuleType(currentModulePath)
  if (moduleType & MODULE_TYPES.JS) {
    // 针对 JS 文件, 进行解析 (require / import)
    traverseJsModule(currentModulePath, callback)
  } else if (moduleType & MODULE_TYPES.CSS) {
    // 针对 CSS 文件, 进行解析 (import / url)
    traverseCssModule(currentModulePath, callback)
  }
}

exports.traverseModule = traverseModule
