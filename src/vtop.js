import childProcess                     from 'child_process'
import cli                              from 'commander'
import Canvas                           from 'drawille'
import os                               from 'os'
// import blessed              from '../../../../banyan/pres/packages/blessed-classic/index'
import { TerminalInterface as blessed } from '../../../pres/packages/terminal-interface'
import { SensorCollection }             from './sensorCollection'
import { ThemeCollection }              from './themeCollection'
import upgrade                          from './upgrade.js'

/**
 * Repeats a string
 * @var string The string to repeat
 * @var integer The number of times to repeat
 * @return {string} The repeated chars as a string.
 */
const stringRepeat = (string, num) => num >= 0 ? new Array(num + 1).join(string) : ''
const
  CPU = 'cpu',
  MEM = 'mem',
  PMS = 'pms'
const
  TOP    = 'top',
  BOTTOM = 'bottom',
  LEFT   = 'left',
  RIGHT  = 'right',
  CENTER = 'center'

export class VTop {
  constructor() {
    // Load in required libs
    this.program = blessed.program()
    /**
     * Instance of blessed this.screen, and the this.charts object
     */
    // this.screen = null
    this.charts = {}
    this.loadedTheme = null

    this.upgradeNotice = false
    this.disableTableUpdate = false
    // @todo: move this into this.charts array
    // This is an instance of Blessed Box
    this.graphs = {
      cpu: null,
      mem: null,
      pms: null
    }
    this.graphPmsSelection = null
    // This is set to the current items displayed
    this.processWidth = 0
    this.graphScale = 1
    /**
     * This is the number of data points drawn
     * @type {Number}
     */
    this.position = 0
    this.intervals = []
    this.theme = process.theme ?? cli.theme

    this.accum = 0
  }
  init() {
    // Private variables
    const size = {
      pixel: {
        width: 0,
        height: 0
      },
      character: {
        width: 0,
        height: 0
      }
    }

    /**
     * Quits running vtop after so many seconds
     * This is mainly for perf testing.
     */
    if (cli['quitAfter'] !== '0') {
      setTimeout(() => {
        process.exit(0)
      }, parseInt(cli['quitAfter'], 10) * 1000)
    }
    try {
      this.loadedTheme = ThemeCollection[this.theme]
    } catch (e) {
      console.log(`The theme '${this.theme}' does not exist.`)
      process.exit(1)
    }
    // Create a this.screen object.
    this.screen = blessed.screen()
    const doCheck = () => {
      upgrade.check(v => {
        this.upgradeNotice = v
        this.drawHeader()
      })
    }
    doCheck()
    // Check for updates every 5 minutes
    // setInterval(doCheck, 300000);
    this.registerKeyBehaviors()
    this.drawHeader()
    // setInterval(drawHeader, 1000);
    this.drawFooter()
    this.graphs.cpu = blessed.box({
      top: 1,
      left: LEFT,
      width: '100%',
      height: '50%',
      content: '',
      fg: this.loadedTheme.chart.fg,
      tags: true,
      border: this.loadedTheme.chart.border
    })
    this.screen.append(this.graphs.cpu)
    let graphMemAppended = false
    const createBottom = () => {
      if (graphMemAppended) {
        this.screen.remove(this.graphs.mem)
        this.screen.remove(this.graphs.pms)
      }
      graphMemAppended = true
      this.graphs.mem = blessed.box({
        top: this.graphs.cpu.height + 1,
        left: LEFT,
        width: '50%',
        height: this.graphs.cpu.height - 2,
        content: '',
        fg: this.loadedTheme.chart.fg,
        tags: true,
        border: this.loadedTheme.chart.border
      })
      this.screen.append(this.graphs.mem)
      this.graphs.pms = blessed.box({
        top: this.graphs.cpu.height + 1,
        left: '50%',
        width: this.screen.width - this.graphs.mem.width,
        height: this.graphs.cpu.height - 2,
        keys: true,
        mouse: cli.mouse,
        fg: this.loadedTheme.table.fg,
        tags: true,
        border: this.loadedTheme.table.border
      })
      this.screen.append(this.graphs.pms)
      this.graphPmsSelection = blessed.list({
        height: this.graphs.pms.height - 3,
        top: 1,
        width: this.graphs.pms.width - 2,
        left: 0,
        keys: true,
        vi: true,
        search(jump) {
          // @TODO
          // jump('string of thing to jump to');
        },
        style: this.loadedTheme.table.items,
        mouse: cli.mouse
      })
      this.graphs.pms.append(this.graphPmsSelection)
      this.graphPmsSelection.focus()
      this.screen.render()
    }
    this.screen.on('resize', () => createBottom())
    createBottom()
    this.screen.append(this.graphs.cpu)
    this.screen.append(this.graphs.pms)
    // Render the this.screen.
    this.screen.render()
    const setupCharts = () => {
      size.pixel.width = (this.graphs.cpu.width - 2) * 2
      size.pixel.height = (this.graphs.cpu.height - 2) * 4
      const plugins = [ CPU, MEM, PMS ]
      for (const plugin of plugins) {
        let width
        let height
        let currentCanvas
        // @todo Refactor this
        switch (plugin) {
          case CPU:
            width = (this.graphs.cpu.width - 3) * 2
            height = (this.graphs.cpu.height - 2) * 4
            currentCanvas = new Canvas(width, height)
            break
          case MEM:
            width = (this.graphs.mem.width - 3) * 2
            height = (this.graphs.mem.height - 2) * 4
            currentCanvas = new Canvas(width, height)
            break
          case PMS:
            width = this.graphs.pms.width - 3
            height = this.graphs.pms.height - 2
            break
        }
        // If we're reconfiguring a plugin, then preserve the already recorded values
        let values
        if (typeof this.charts[plugin] !== 'undefined' && typeof this.charts[plugin].values !== 'undefined') {
          values = this.charts[plugin].values
        } else {
          values = []
        }
        this.charts[plugin] = {
          chart: currentCanvas,
          values,
          plugin: SensorCollection[plugin],
          width,
          height
        }
        this.charts[plugin].plugin.poll()
      }
      // @TODO Make this less hard-coded
      this.graphs.cpu.setLabel(` ${this.charts.cpu.plugin.title} `)
      this.graphs.mem.setLabel(` ${this.charts.mem.plugin.title} `)
      this.graphs.pms.setLabel(` ${this.charts.pms.plugin.title} `)
    }
    setupCharts()
    this.screen.on('resize', setupCharts)
    this.intervals.push(setInterval(this.draw.bind(this), parseInt(cli['updateInterval'], 10)))

    // @todo Make this more sexy
    this.intervals.push(setInterval(this.charts.cpu.plugin.poll, this.charts.cpu.plugin.interval))
    this.intervals.push(setInterval(this.charts.mem.plugin.poll, this.charts.mem.plugin.interval))
    this.intervals.push(setInterval(this.charts.pms.plugin.poll, this.charts.pms.plugin.interval))
  }
  /**
   * Draw header
   * @param  {string} left  This is the text to go on the left
   * @param  {string} right This is the text for the right
   * @return {void}
   */
  drawHeader() {
    let headerText
    let headerTextNoTags
    if (this.upgradeNotice) {
      this.upgradeNotice = `${this.upgradeNotice}`
      headerText = ` {bold}vtop{/bold}{white-fg} for ${os.hostname()} {red-bg} Press 'u' to upgrade to v${this.upgradeNotice} {/red-bg}{/white-fg}`
      headerTextNoTags = ` vtop for ${os.hostname()}  Press 'u' to upgrade to v${this.upgradeNotice} `
    } else {
      headerText = ` {bold}vtop{/bold}{white-fg} for ${os.hostname()} `
      headerTextNoTags = ` vtop for ${os.hostname()} `
    }

    const header = blessed.text({
      top: TOP,
      left: LEFT,
      width: headerTextNoTags.length,
      height: '1',
      fg: this.loadedTheme.title.fg,
      content: headerText,
      tags: true
    })
    const date = blessed.text({
      top: TOP,
      right: 0,
      width: 9,
      height: '1',
      align: RIGHT,
      content: '',
      tags: true
    })
    const loadAverage = blessed.text({
      top: TOP,
      height: '1',
      align: CENTER,
      content: '',
      tags: true,
      left: ~~(this.program.cols / 2 - 28 / 2)
    })
    this.screen.append(header)
    this.screen.append(date)
    this.screen.append(loadAverage)

    const zeroPad = input => `0${input}`.slice(-2)

    const updateTime = () => {
      const time = new Date()
      date.setContent(`${zeroPad(time.getHours())}:${zeroPad(time.getMinutes())}:${zeroPad(time.getSeconds())} `)
      this.screen.render()
    }

    const updateLoadAverage = () => {
      const avg = os.loadavg()
      loadAverage.setContent(`Load Average: ${avg[0].toFixed(2)} ${avg[1].toFixed(2)} ${avg[2].toFixed(2)}`)
      this.screen.render()
    }

    updateTime()
    updateLoadAverage()
    setInterval(updateTime, 1000)
    setInterval(updateLoadAverage, 1000)
  }
  /**
   * Draw the footer
   *
   * @todo This appears to break on some viewports
   */
  drawFooter() {
    const commands = {
      'dd': 'Kill process',
      'j': 'Down',
      'k': 'Up',
      'g': 'Jump to top',
      'G': 'Jump to bottom',
      'c': 'Sort by CPU',
      'm': 'Sort by Mem'
    }
    let text = ''
    for (const c in commands) {
      const command = commands[c]
      text += `  {white-bg}{black-fg}${c}{/black-fg}{/white-bg} ${command}`
    }
    text += '{|}http://parall.ax/vtop'
    const footerRight = blessed.box({
      width: '100%',
      top: this.program.rows - 1,
      tags: true,
      fg: this.loadedTheme.footer.fg
    })
    footerRight.setContent(text)
    this.screen.append(footerRight)
  }
  /**
   * This draws a chart
   * @param  {string} chartKey The key of the chart.
   * @return {string}       The text output to draw.
   */
  drawChart(chartKey) {
    const chOb = this.charts[chartKey]
    const ch = chOb.chart
    ch.clear()
    if (!this.charts[chartKey].plugin.initialized) return false
    const dataPointsToKeep = 5000
    this.charts[chartKey].values[this.position] = this.charts[chartKey].plugin.currentValue
    const computeValue = input => chOb.height - ~~(((chOb.height + 1) / 100) * input) - 1
    if (this.position > dataPointsToKeep)
      delete this.charts[chartKey].values[this.position - dataPointsToKeep]
    for (const pos in this.charts[chartKey].values)
      if (this.graphScale >= 1 || this.graphScale < 1 && pos % (1 / this.graphScale) === 0) {
        const p = parseInt(pos, 10) + (chOb.width - this.charts[chartKey].values.length)
        // calculated x-value based on this.graphScale
        const x = p * this.graphScale + (1 - this.graphScale) * chOb.width
        // draws top line of chart
        if (p > 1 && computeValue(this.charts[chartKey].values[pos - 1]) > 0) {
          ch.set(x, computeValue(this.charts[chartKey].values[pos - 1]))
        }
        // Start deleting old data points to improve performance
        // @todo: This is not be the best place to do this
        // fills all area underneath top line
        for (let y = computeValue(this.charts[chartKey].values[pos - 1]); y < chOb.height; y++) {
          if (this.graphScale > 1 && p > 0 && y > 0) {
            const current = computeValue(this.charts[chartKey].values[pos - 1])
            const next = computeValue(this.charts[chartKey].values[pos])
            const diff = (next - current) / this.graphScale
            // adds columns between data if this.graphs.cpu is zoomed in, takes average where data is missing to make smooth curve
            for (let i = 0; i < this.graphScale; i++) {
              ch.set(x + i, y + diff * i)
              for (let j = y + diff * i; j < chOb.height; j++) {
                ch.set(x + i, j)
              }
            }
          } else if (this.graphScale <= 1) {
            // magic number used to calculate when to draw a value onto the chart
            // @TODO: Remove this?
            // var allowedPValues = (this.charts[chartKey].values.length - ((this.graphScale * this.charts[chartKey].values.length) + 1)) * -1
            ch.set(x, y)
          }
        }
      }
    // Add percentage to top right of the chart by splicing it into the braille data
    const textOutput = ch.frame().split('\n')
    const percent = `   ${chOb.plugin.currentValue}`
    textOutput[0] = `${textOutput[0].slice(0, textOutput[0].length - 4)}{white-fg}${percent.slice(-3)}%{/white-fg}`
    return textOutput.join('\n')
  }
  /**
   * Draws a table.
   * @param  {string} chartKey The key of the chart.
   * @return {string}       The text output to draw.
   */
  drawTable(chartKey) {
    const chart = this.charts[chartKey]
    const columnLengths = {}
    // Clone the column array
    const columns = chart.plugin.columns.slice(0)
    columns.reverse()
    let removeColumn = false
    const lastItem = columns[columns.length - 1]
    const minimumWidth = 12
    const padding = chart.width > 80 ? 3 : chart.width > 50 ? 2 : 1
    // Keep trying to reduce the number of columns
    do {
      let totalUsed = 0
      let firstLength = 0
      // var totalColumns = columns.length
      // Allocate space for each column in reverse order
      for (const column in columns) {
        const item = columns[column]
        this.accum++
        // If on the last column (actually first because of array order)
        // then use up all the available space
        if (item === lastItem) {
          columnLengths[item] = chart.width - totalUsed
          firstLength = columnLengths[item]
        } else {
          columnLengths[item] = item.length + padding
        }
        totalUsed += columnLengths[item]
      }
      if (firstLength < minimumWidth && columns.length > 1) {
        totalUsed = 0
        columns.shift()
        removeColumn = true
      } else {
        removeColumn = false
      }
    } while (removeColumn)
    // And back again
    columns.reverse()
    let titleOutput = '{bold}'
    for (const headerColumn in columns) {
      const colText = ` ${columns[headerColumn]}`
      titleOutput += colText + stringRepeat(' ', columnLengths[columns[headerColumn]] - colText.length)
    }
    titleOutput += '{/bold}' + '\n'
    const bodyOutput = []
    for (const row in chart.plugin.currentValue) {
      const currentRow = chart.plugin.currentValue[row]
      let rowText = ''
      for (const bodyColumn in columns) {
        let colText = ` ${currentRow[columns[bodyColumn]]}`
        rowText += (colText + stringRepeat(' ', columnLengths[columns[bodyColumn]] - colText.length)).slice(0, columnLengths[columns[bodyColumn]])
      }
      bodyOutput.push(rowText)
    }
    return {
      title: titleOutput,
      body: bodyOutput,
      processWidth: columnLengths[columns[0]]
    }
  }
  /**
   * Overall draw function, this should poll and draw results of
   * the loaded sensors.
   */
  draw() {
    let currentItems = []
    this.position++
    this.graphs.cpu.setContent(this.drawChart(CPU))
    this.graphs.mem.setContent(this.drawChart(MEM))
    if (!this.disableTableUpdate) {
      const table = this.drawTable(PMS)
      this.graphs.pms.setContent(table.title)

      // If we keep the stat numbers the same immediately, then update them
      // after, the focus will follow. This is a hack.
      const existingStats = {}
      // Slice the start process off, then store the full stat,
      // so we can inject the same stat onto the new order for a brief render
      // cycle.
      for (const stat in currentItems) {
        const thisStat = currentItems[stat]
        existingStats[thisStat.slice(0, table.processWidth)] = thisStat
      }
      this.processWidth = table.processWidth
      // Smush on to new stats
      const tempStats = []
      for (let stat in table.body) {
        const thisStat = table.body[stat]
        tempStats.push(existingStats[thisStat.slice(0, table.processWidth)])
      }
      // Move cursor this.position with temp stats
      // this.processListSelection.setItems(tempStats);
      // Update the numbers
      this.graphPmsSelection.setItems(table.body)
      this.graphPmsSelection.focus()
      currentItems = table.body
    }
    this.screen.render()
  }
  registerKeyBehaviors() {
    // Configure 'q', esc, Ctrl+C for quit
    let upgrading = false
    let lastKey = ''
    let disableTableUpdateTimeout = setTimeout(() => {}, 0)
    this.screen.on('keypress', (ch, key) => {
      if (key === 'up' || key === 'down' || key === 'k' || key === 'j') {
        // Disable table updates for half a second
        this.disableTableUpdate = true
        clearTimeout(disableTableUpdateTimeout)
        disableTableUpdateTimeout = setTimeout(() => this.disableTableUpdate = false, 1000)
      }
      if (upgrading === false && (
        key.name === 'q' ||
        key.name === 'escape' ||
        key.ctrl && key.name === 'c'
      )) {
        return process.exit(0)
      }
      // dd killall
      // @todo: Factor this out
      if (lastKey === 'd' && key.name === 'd') {
        let selectedProcess = this.graphPmsSelection.getItem(this.graphPmsSelection.selected).content
        selectedProcess = selectedProcess.slice(0, this.processWidth).trim()
        childProcess.exec(`killall "${selectedProcess}"`, () => {})
      }
      if (key.name === 'c' && this.charts.pms.plugin.sort !== CPU) {
        this.charts.pms.plugin.sort = CPU
        this.charts.pms.plugin.poll()
        setTimeout(() => {
          this.graphPmsSelection.select(0)
        }, 200)
      }
      if (key.name === 'm' && this.charts.pms.plugin.sort !== MEM) {
        this.charts.pms.plugin.sort = MEM
        this.charts.pms.plugin.poll()
        setTimeout(() => this.graphPmsSelection.select(0), 200)
      }
      lastKey = key.name
      if (key.name === 'u' && upgrading === false) {
        upgrading = true
        // Clear all this.intervals
        for (const interval in this.intervals) clearInterval(this.intervals[interval])
        this.graphPmsSelection.detach()
        this.program = blessed.program()
        this.program.clear()
        this.program.disableMouse()
        this.program.showCursor()
        this.program.normalBuffer()
        // @todo: show changelog AND smash existing data into it :D
        upgrade.install('vtop', [ { theme: this.theme } ])
      }
      if ((key.name === LEFT || key.name === 'h') && this.graphScale < 8) {
        this.graphScale *= 2
      } else if ((key.name === RIGHT || key.name === 'l') && this.graphScale > 0.125) {
        this.graphScale /= 2
      }
    })
  }
}