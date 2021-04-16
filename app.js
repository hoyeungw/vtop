import cli                    from 'commander'
import { version as VERSION } from './package.json'
import { ThemeCollection }    from './src/themeCollection'
import { VTop }               from './src/vtop'

// Set up the commander instance and add the required options
cli
  .option('-t, --theme  [name]', `set the vtop theme [${Object.keys(ThemeCollection).join('|')}]`, 'parallax')
  .option('--no-mouse', 'Disables mouse interactivity')
  .option('--quit-after [seconds]', 'Quits vtop after interval', '0')
  .option('--update-interval [milliseconds]', 'Interval between updates', '300')
  .version(VERSION)
  .parse(process.argv)

new VTop().init()
// App.init()
