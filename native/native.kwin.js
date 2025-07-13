SERVICE_NAME = 'org.berrylium.firefox.windowsmover'
OBJECT_PATH = '/'
INTERFACE_NAME = 'local.firefox_windows_mover_native_host.KWinScriptAgent'

// snippet
function callService(...args) {
    callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, ...args)
}
function debug(str) {
    callService('sendMessage', {
        type: "log.native",
        info: str
    })
}

// simple debug function
function verbose(obj) {
    if (typeof(obj) !== "object")
        return obj;
    let str = '{';
    let keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        str += key;
        if (obj[key] !== undefined)
            str += ': ' + verbose(obj[key]);
        if (i < keys.length - 1) {
            str += ', ';
        }
    }
    str += '}';
    return str
}

function sendCurrentDesktop() {
    callService('sendMessage', {
        type: "desktop.update",
        desk: workspace.currentDesktop.id,
        actv: workspace.currentActivity
    })
}

sendCurrentDesktop()
workspace.currentDesktopChanged.connect(sendCurrentDesktop)
workspace.currentActivityChanged.connect(sendCurrentDesktop)

GET_ID_REGEX = /^[0-9]*$/
var ID_PREFIX = ''
var ID_SUFFIX = ''

function getFirefoxWindowID(caption) {
    const len = ID_PREFIX.length;
    if (caption.slice(0, len) !== ID_PREFIX)
        return undefined;
    const parts = caption.slice(len).split(ID_SUFFIX, 1)
    if (parts.length >= 1 && GET_ID_REGEX.test(parts[0]))
        return Number(parts[0]);
    return undefined;
}

// sorry I'm not familiar with OOP in JS, so I'm using a closure!
window_by_ID = new Map()
function trackWindow(window) {
    let id = undefined
    var sendWindowPosition = function() {
        var desktopIDs = []
        if (!window.onAllDesktops)
            desktopIDs = window.desktops.map((desktop) => desktop.id)
        var activityIDs = window.activities
        callService('sendMessage', {
                type: "window.update",
                wid: id,
                desks: desktopIDs,
                actvs: activityIDs
            })
    }
    var moveWindow = function(desktops, activities) {
        let targetActivities = new Set(activities)
        let targetDesktops = new Set(desktops)
        window.activities = workspace.activities.filter((act) => targetActivities.has(act))
        window.desktops = workspace.desktops.filter((desktop) => targetDesktops.has(desktop.id))
    }
    var dealWithMessage = function(msg) {
        if (msg.type === 'query') {
            sendWindowPosition()
        } else { // move
            moveWindow(msg.desks, msg.actvs)
        }
    }
    var onClosed = function() {
        window_by_ID.delete(id)
    }
    var onNewFirefoxWindowDetected = function() {
        debug(`new firefox window detected! ID: ${id}`)

        var winData = window_by_ID.get(id);
        if (winData === undefined) {
            window_by_ID.set(id, {callback: dealWithMessage});
        } else {
            winData.orders.forEach(dealWithMessage);
            winData.orders = undefined;
            winData.callback = dealWithMessage;
        }
        window.desktopsChanged.connect(() => {debug('desktop change');sendWindowPosition()})
        window.activitiesChanged.connect(() => {debug('activity change');sendWindowPosition()})
        window.closed.connect(onClosed)
    }
    if (window.desktopFileName == 'firefox') { /* maybe we can add more filters here? */
        id = getFirefoxWindowID(window.caption)
        if (id !== undefined) {
            onNewFirefoxWindowDetected()
        } else {
            // since there might be delay in setting the window title preface...
            var onTitleChange = function() {
                id = getFirefoxWindowID(window.caption)
                if (id !== undefined) {
                    onNewFirefoxWindowDetected()
                    window.captionChanged.disconnect(onTitleChange)
                }
            }
            window.captionChanged.connect(onTitleChange)
        }
    }
}

function onMessage(msg) {
    debug(verbose(msg))
    if (msg.type == 'config') {
        if (ID_PREFIX !== '') {
            debug('Please restart the extension to reconfigure');
            return;
        }
        ID_PREFIX = msg.ID_pattern.prefix;
        ID_SUFFIX = msg.ID_pattern.suffix;
        // track all existing windows and future windows
        workspace.windowAdded.connect(trackWindow)
        windowList = workspace.windowList()
        for (i in windowList) trackWindow(windowList[i])
    } else if (msg.type == 'query' || msg.type == 'move') {
        var wid = msg.winID;
        var data = window_by_ID.get(wid);
        if (data === undefined) {
            window_by_ID.set(wid, {orders: [msg]});
        } else if (data.callback === undefined) {
            data.orders.push(msg);
        } else {
            data.callback(msg);
        }
    } else if (msg.type == 'switch desktop') {
        workspace.currentDesktop = workspace.desktops.find((desk) => desk.id == msg.desk)
        workspace.currentActivity = msg.actv
    }
}


timer = new QTimer()
timer.interval = 20 // ms
timer.timeout.connect(() => {
    callService('checkMessage', function(list) {
        for(let i = 0; i < list.length; i++)
            onMessage(list[i]);
    })

});
timer.start()
