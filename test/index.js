const chalk = require('chalk')
const filterModules = require('../src/index.js')
const path = require('path')

const { all, used, filtered } = filterModules({
  cwd: process.cwd(),
  entries: ['./demo-project/fre.js', './demo-project/suzhe2.js'],
  includes: ['./demo-project/**/*'],
  resolveRequirePath: (curDir, requirePath) => {
    if (requirePath === 'b') {
      return path.resolve(curDir, './lib/ssh.js')
    }
    return requirePath
  }
})

console.log(chalk.blue('used modules:'))
console.log(used)
console.log(chalk.yellow('filtered modules:'))
console.log(filtered)
