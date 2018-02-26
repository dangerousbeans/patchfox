#! /usr/bin/env node

const http = require('http')
const serve = require('ecstatic')
const fs = require('fs')
const path = require('path')
const ssbKeys = require('ssb-keys')
const minimist = require('minimist')
const serverDiscovery = require('ssb-server-discovery')
const eventEmitter = serverDiscovery.eventEmitter
const notifier = require('node-notifier')
const SysTray = require('systray').default
let shouldGrantPerms = false

eventEmitter.on('server-discovery-request', (origin) => {
  console.log("######### DISCOVERY REQUEST #############", origin)
  let msg
  let action

  if (shouldGrantPerms) {
    action = "granted"
  } else {
    action = "denied"
  }

  if (origin.startsWith("moz-extension://")) {
    msg = `Firefox Add-on ${origin} ${action} access to sbot.`
  } else {
    msg = `Web Application ${origin} ${action} access to sbot.`
  }

  eventEmitter.emit('server-discovery-response', origin, shouldGrantPerms)

  notifier.notify({
    title: 'Secure Scuttlebutt',
    message: msg,
    icon: path.join(__dirname, "icon.png"),
    wait: true,
    id: 0,
  })
})

let argv = process.argv.slice(2)
let i = argv.indexOf('--')
let conf = argv.slice(i + 1)
argv = ~i ? argv.slice(0, i) : argv

const config = require('ssb-config/inject')(process.env.ssb_appname, minimist(conf))

const keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))
if (keys.curve === 'k256') {
  throw new Error('k256 curves are no longer supported,' +
    'please delete' + path.join(config.path, 'secret'))
}

const manifestFile = path.join(config.path, 'manifest.json')

// special server command:
// import sbot and start the server

const createSbot = require('scuttlebot')
  // .use(require('scuttlebot/plugins/plugins'))
  .use(require('scuttlebot/plugins/master'))
  .use(require('scuttlebot/plugins/gossip'))
  .use(require('scuttlebot/plugins/replicate'))
  .use(require('ssb-friends'))
  .use(require('ssb-blobs'))
  .use(require('scuttlebot/plugins/invite'))
  .use(require('scuttlebot/plugins/local'))
  // .use(require('scuttlebot/plugins/logging'))
  // .use(require('scuttlebot/plugins/private'))
  // .use(require('ssb-query'))
  // .use(require('ssb-links'))
  .use(require('ssb-ooo'))
  .use(require('ssb-ebt'))
  .use(require('ssb-ws'))
  .use(serverDiscovery)
  .use(require('ssb-names'))

// http.createServer(
//   serve({ root: path.resolve('../webextension/build/') })
// ).listen(3013)

// add third-party plugins
// require('./plugins/plugins').loadUserPlugins(createSbot, config)

// start server

config.keys = keys
const server = createSbot(config)

// write RPC manifest to ~/.ssb/manifest.json
fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))

const icon = fs.readFileSync(path.join(__dirname, `icon.${process.platform === 'win32' ? 'ico' : 'png'}`))
const tray = new SysTray({
  menu: {
    icon: icon.toString('base64'),
    title: 'Secure Scuttlebutt',
    tooltip: 'Secure Scuttlebutt tray app',
    items: [
      {
        title: 'Grant connections',
        tooltip: 'If enabled grant connection for applications',
        checked: shouldGrantPerms,
        enabled: true
      },
      {
        title: 'Quit',
        tooltip: 'Stop sbot and quit tray application',
        checked: false,
        enabled: true
      }
    ]
  },
  debug: false,
  copyDir: true,
})

tray.onClick(action => {
  switch (action.seq_id) {
    case 0:
      shouldGrantPerms = !shouldGrantPerms
      tray.sendAction({
        type: 'update-item',
        item: {
          ...action.item,
          checked: shouldGrantPerms,
        },
        seq_id: action.seq_id,
      })

      let permMsg = shouldGrantPerms ? "grant" : "deny"

      notifier.notify({
        title: 'Secure Scuttlebutt',
        message: `Secure Scuttlebutt will ${permMsg} connections to sbot`,
        icon: path.join(__dirname, "icon.png"),
        wait: true,
        id: 0,
      })

      break
    case 1:
      console.log("### EXITING IN TWO SECONDS ###")

      notifier.notify({
        title: 'Secure Scuttlebutt',
        message: `Secure Scuttlebutt will exit in two seconds...`,
        icon: path.join(__dirname, "icon.png"),
        wait: true,
        id: 0,
      })

      tray.kill()
  }
})

tray.onExit((code, signal) => {
  setTimeout(() =>
    process.exit(0), 2000)
})