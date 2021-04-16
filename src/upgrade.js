/**
 * npm package updater
 *
 * @copyright 2014 James HAll
 *
 * This will detect if a package needs and update,
 * and also update it
 */
const
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right',
  CENTER = 'center'

const upgrade = (function () {
  return {
    /**
     * Should call the callback with a new version number, or false
     */
    check: function (callback) {
      try {
        const packageObj = require('../package.json')

        const childProcess = require('child_process')
        childProcess.exec('npm info --json ' + packageObj.name, function (error, stdout, stderr) {
          if (error) {
            callback(null, null)
            return
          }
          let output
          try {
            output = JSON.parse(stdout)
          } catch (e) {
            callback(null, null)
            return
          }
          if (output['dist-tags']['latest'] !== packageObj.version) {
            callback(output['dist-tags']['latest'])
          } else {
            callback(null, null)
          }
        })
      } catch (e) {
        callback(null, null)
      }
    },
    /**
     * This will install the update and relaunch
     */
    install: function (packageName, vars) {
      const sudo = require('sudo')
      console.log('')
      console.log('Installing vtop update...')
      console.log('')
      console.log(' ** You will need to enter your password to upgrade ** ')
      console.log('')

      const args = ['npm', 'install', '-g', 'vtop']
      console.log(args.join(' '))

      const options = {
        cachePassword: false,
        prompt: 'Password:',
        spawnOptions: { stdio: 'inherit' }
      }
      const child = sudo(args, options)

      let path = false
      child.stdout.on('data', function (data) {
        console.log(data.toString())

        if (data.toString().indexOf('vtop.js') !== -1) {
          path = data.toString().trim().split(' ')[2]
        }
      })
      child.stderr.on('data', function (data) {
        console.log(data.toString())
      })

      child.on('close', function () {
        for (let file in require.cache) {
          delete require.cache[file]
        }
        console.log('Finished updating. Clearing cache and relaunching...')
        setTimeout(function () {
          for (const v in vars) {
            process[v] = vars[v]
          }
          require(path)
        }, 1000)
      })
    }
  }
}())

module.exports = upgrade
